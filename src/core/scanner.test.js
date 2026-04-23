import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { groupByDirectory, buildGroupPrompt, buildGroupPromptSymbols, scanTree, extractSymbols, extractFileSummary } from './scanner.js';
import { withTempDir } from '../test-helpers.js';

describe('groupByDirectory', () => {
  it('groups root files under "."', () => {
    const tree = { files: [{ rel: 'index.js', size: 100 }, { rel: 'package.json', size: 50 }] };
    const groups = groupByDirectory(tree);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].dir, '.');
    assert.equal(groups[0].files.length, 2);
  });

  it('groups files by top-level directory', () => {
    const tree = {
      files: [
        { rel: path.join('src', 'a.js'), size: 100 },
        { rel: path.join('src', 'b.js'), size: 200 },
        { rel: path.join('lib', 'c.js'), size: 150 },
      ],
    };
    const groups = groupByDirectory(tree);
    assert.equal(groups.length, 2);
    const srcGroup = groups.find(g => g.dir === 'src');
    const libGroup = groups.find(g => g.dir === 'lib');
    assert.ok(srcGroup);
    assert.ok(libGroup);
    assert.equal(srcGroup.files.length, 2);
    assert.equal(libGroup.files.length, 1);
  });

  it('handles mix of root and nested files', () => {
    const tree = {
      files: [
        { rel: 'README.md', size: 50 },
        { rel: path.join('src', 'index.js'), size: 100 },
      ],
    };
    const groups = groupByDirectory(tree);
    assert.equal(groups.length, 2);
    assert.ok(groups.find(g => g.dir === '.'));
    assert.ok(groups.find(g => g.dir === 'src'));
  });

  it('returns empty array for empty tree', () => {
    const groups = groupByDirectory({ files: [] });
    assert.equal(groups.length, 0);
  });
});

describe('buildGroupPrompt', () => {
  it('includes directory name', () => {
    const prompt = buildGroupPrompt('src/core', [{ path: 'log.js', content: 'export function log() {}' }]);
    assert.ok(prompt.includes('src/core'));
  });

  it('includes file content', () => {
    const content = 'export function hello() { return "world"; }';
    const prompt = buildGroupPrompt('lib', [{ path: 'hello.js', content }]);
    assert.ok(prompt.includes(content));
  });

  it('includes file count', () => {
    const files = [
      { path: 'a.js', content: 'a' },
      { path: 'b.js', content: 'b' },
    ];
    const prompt = buildGroupPrompt('src', files);
    assert.ok(prompt.includes('Files: 2'));
  });

  it('truncates large files to budget', () => {
    const bigContent = 'x'.repeat(100000);
    const prompt = buildGroupPrompt('big', [{ path: 'big.js', content: bigContent }]);
    assert.ok(prompt.length < bigContent.length);
  });
});

describe('scanTree', () => {
  it('scans a directory with source files', async () => {
    await withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("hi")', 'utf-8');
      fs.writeFileSync(path.join(dir, 'data.bin'), 'binary', 'utf-8'); // not a source extension
      const tree = scanTree(dir);
      assert.equal(tree.files.length, 1);
      assert.equal(tree.files[0].rel, 'index.js');
    });
  });

  it('skips node_modules', async () => {
    await withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node_modules', 'lib.js'), 'module', 'utf-8');
      fs.writeFileSync(path.join(dir, 'app.js'), 'app', 'utf-8');
      const tree = scanTree(dir);
      assert.equal(tree.files.length, 1);
      assert.equal(tree.files[0].rel, 'app.js');
    });
  });

  it('tracks skipped files that exceed size limit', async () => {
    await withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'small.js'), 'x', 'utf-8');
      fs.writeFileSync(path.join(dir, 'big.js'), 'x'.repeat(60 * 1024), 'utf-8');
      const tree = scanTree(dir);
      assert.equal(tree.files.length, 1);
      assert.equal(tree.skipped.length, 1);
      assert.equal(tree.skipped[0].reason, 'size');
    });
  });

  it('returns empty for empty directory', async () => {
    await withTempDir((dir) => {
      const tree = scanTree(dir);
      assert.equal(tree.files.length, 0);
    });
  });

  it('handles single file path', async () => {
    await withTempDir((dir) => {
      const filePath = path.join(dir, 'single.js');
      fs.writeFileSync(filePath, 'code', 'utf-8');
      const tree = scanTree(filePath);
      assert.equal(tree.files.length, 1);
      assert.equal(tree.files[0].rel, 'single.js');
    });
  });
});

describe('extractSymbols', () => {
  it('captures top-level JS exports, functions, classes', () => {
    const src = `
import { readFile } from 'fs';
import chalk from 'chalk';

// a comment
export function hello(name) {
  return 'hi ' + name;
}

export const GREETING = 'hello';

export class Widget extends Base {
  constructor() {}
}

async function internal() {
  const nested = 1; // should not be captured (indented + not top-level kw)
}
`;
    const syms = extractSymbols(src);
    assert.ok(syms.some(s => s.startsWith('import')));
    assert.ok(syms.some(s => s.startsWith('export function hello')));
    assert.ok(syms.some(s => s.startsWith('export const GREETING')));
    assert.ok(syms.some(s => s.startsWith('export class Widget')));
    assert.ok(syms.some(s => s.startsWith('async function internal')));
    // Comments and deeply indented lines should not appear
    assert.ok(!syms.some(s => s.includes('a comment')));
    assert.ok(!syms.some(s => s.includes('nested')));
  });

  it('captures Python def/class/from imports', () => {
    const src = `
from fastapi import APIRouter
import os

def get_user(user_id):
    return {"id": user_id}

class UserService:
    def find(self):  # indented — should NOT be a top-level symbol
        pass

async def create_user(data):
    pass
`;
    const syms = extractSymbols(src);
    assert.ok(syms.some(s => s.startsWith('from fastapi')));
    assert.ok(syms.some(s => s.startsWith('import os')));
    assert.ok(syms.some(s => s.startsWith('def get_user')));
    assert.ok(syms.some(s => s.startsWith('class UserService')));
    assert.ok(syms.some(s => s.startsWith('async def create_user')));
    assert.ok(!syms.some(s => s.includes('def find')));
  });

  it('captures Go func/type/package', () => {
    const src = `
package main

import "fmt"

func main() {
    fmt.Println("hi")
}

type User struct {
    ID int
}
`;
    const syms = extractSymbols(src);
    assert.ok(syms.some(s => s.startsWith('package main')));
    assert.ok(syms.some(s => s.startsWith('import')));
    assert.ok(syms.some(s => s.startsWith('func main')));
    assert.ok(syms.some(s => s.startsWith('type User')));
  });

  it('returns empty array for empty or non-string input', () => {
    assert.deepEqual(extractSymbols(''), []);
    assert.deepEqual(extractSymbols(null), []);
    assert.deepEqual(extractSymbols(undefined), []);
  });

  it('respects maxLines', () => {
    const src = Array.from({ length: 50 }, (_, i) => `export const x${i} = ${i};`).join('\n');
    const syms = extractSymbols(src, { maxLines: 5 });
    assert.equal(syms.length, 5);
  });

  it('truncates lines longer than maxLineLength', () => {
    const longSuffix = 'x'.repeat(200);
    const src = `export const bigDecl = '${longSuffix}';`;
    const syms = extractSymbols(src, { maxLineLength: 50 });
    assert.equal(syms.length, 1);
    assert.ok(syms[0].length <= 50);
    assert.ok(syms[0].endsWith('...'));
  });
});

describe('extractFileSummary', () => {
  it('returns type "symbols" for source files', () => {
    const out = extractFileSummary('foo.js', 'export function bar() {}');
    assert.equal(out.type, 'symbols');
    assert.ok(Array.isArray(out.items));
  });

  it('returns type "head" for non-source files like json/md', () => {
    const out = extractFileSummary('package.json', '{"name": "x"}');
    assert.equal(out.type, 'head');
    assert.ok(out.text.includes('"name"'));
  });

  it('truncates head sample at maxHeadBytes', () => {
    const big = 'x'.repeat(2000);
    const out = extractFileSummary('config.yaml', big, { maxHeadBytes: 50 });
    assert.equal(out.type, 'head');
    assert.equal(out.text.length, 50);
  });
});

describe('buildGroupPromptSymbols', () => {
  it('emits per-file header with size and symbol bullets', () => {
    const files = [
      { path: 'src/foo.js', size: 300, content: 'export function foo() {}\nexport const BAR = 1;' },
    ];
    const prompt = buildGroupPromptSymbols('src', files);
    assert.ok(prompt.includes('### src/foo.js'));
    assert.ok(prompt.includes('- export function foo'));
    assert.ok(prompt.includes('- export const BAR'));
  });

  it('is dramatically smaller than buildGroupPrompt for source files', () => {
    const longBody = Array.from({ length: 200 }, (_, i) => `  const local${i} = ${i}; // noise`).join('\n');
    const content = `export function top() {\n${longBody}\n}\nexport const X = 1;`;
    const files = [{ path: 'src/a.js', size: content.length, content }];

    const symbolsPrompt = buildGroupPromptSymbols('src', files);
    const deepPrompt = buildGroupPrompt('src', files);

    // Symbol prompt must not include the `const local*` noise lines
    assert.ok(!symbolsPrompt.includes('local50'));
    // But the deep prompt should
    assert.ok(deepPrompt.includes('local50'));
    // And symbol prompt should be meaningfully smaller
    assert.ok(symbolsPrompt.length < deepPrompt.length / 2);
  });

  it('falls back to head sample for non-code extensions', () => {
    const files = [{ path: 'config.yaml', size: 100, content: 'key: value\nfoo: 1' }];
    const prompt = buildGroupPromptSymbols('conf', files);
    assert.ok(prompt.includes('key: value'));
  });
});

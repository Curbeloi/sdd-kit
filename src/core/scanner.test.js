import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { groupByDirectory, buildGroupPrompt, scanTree } from './scanner.js';
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

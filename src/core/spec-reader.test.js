import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTasks, findNextPendingTask, readSpec, parseFrontmatter, stringifyFrontmatter } from './spec-reader.js';
import { withTempDir, createMockSpec } from '../test-helpers.js';

describe('parseTasks', () => {
  it('parses a standard task', () => {
    const input = '- [ ] **1.1** Create User model `app/models/user.py`';
    const tasks = parseTasks(input);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].done, false);
    assert.equal(tasks[0].id, '1.1');
    assert.equal(tasks[0].desc, 'Create User model');
    assert.equal(tasks[0].file, 'app/models/user.py');
  });

  it('parses a completed task', () => {
    const input = '- [x] **2.1** Add login endpoint `app/routers/auth.py`';
    const tasks = parseTasks(input);
    assert.equal(tasks[0].done, true);
    assert.equal(tasks[0].id, '2.1');
  });

  it('parses uppercase X as done', () => {
    const input = '- [X] **1.1** Fix bug `src/fix.js`';
    const tasks = parseTasks(input);
    assert.equal(tasks[0].done, true);
  });

  it('parses task without file path', () => {
    const input = '- [ ] **3.1** Write integration tests';
    const tasks = parseTasks(input);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].desc, 'Write integration tests');
    assert.equal(tasks[0].file, null);
  });

  it('parses multi-level IDs (1.2.3)', () => {
    const input = '- [ ] **1.2.3** Deep nested task `src/deep.js`';
    const tasks = parseTasks(input);
    assert.equal(tasks[0].id, '1.2.3');
  });

  it('parses path without slash or dot', () => {
    const input = '- [ ] **1.1** Update config `Dockerfile`';
    const tasks = parseTasks(input);
    assert.equal(tasks[0].file, 'Dockerfile');
  });

  it('parses task with requirement reference', () => {
    const input = '- [ ] **1.1** Add endpoint `src/api.js` <- Req 1.1';
    const tasks = parseTasks(input);
    assert.equal(tasks[0].file, 'src/api.js');
    assert.equal(tasks[0].desc, 'Add endpoint');
  });

  it('parses task with arrow reference', () => {
    const input = '- [x] **2.1** Deploy service `infra/main.tf` ← AC 2';
    const tasks = parseTasks(input);
    assert.equal(tasks[0].done, true);
    assert.equal(tasks[0].file, 'infra/main.tf');
  });

  it('returns empty array for empty content', () => {
    assert.deepEqual(parseTasks(''), []);
    assert.deepEqual(parseTasks(null), []);
    assert.deepEqual(parseTasks(undefined), []);
  });

  it('ignores non-task lines', () => {
    const input = `# Tasks
Some description text
- Not a real checkbox
- [ ] **1.1** Real task`;
    const tasks = parseTasks(input);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, '1.1');
  });

  it('parses multiple tasks', () => {
    const input = `- [ ] **1.1** First task \`src/a.js\`
- [x] **1.2** Second task \`src/b.js\`
- [ ] **2.1** Third task`;
    const tasks = parseTasks(input);
    assert.equal(tasks.length, 3);
    assert.equal(tasks[0].done, false);
    assert.equal(tasks[1].done, true);
    assert.equal(tasks[2].file, null);
  });
});

describe('findNextPendingTask', () => {
  it('returns first pending task', () => {
    const tasks = [
      { done: true, id: '1.1' },
      { done: false, id: '1.2' },
      { done: false, id: '2.1' },
    ];
    assert.equal(findNextPendingTask(tasks).id, '1.2');
  });

  it('returns null when all done', () => {
    const tasks = [
      { done: true, id: '1.1' },
      { done: true, id: '1.2' },
    ];
    assert.equal(findNextPendingTask(tasks), null);
  });

  it('returns null for empty array', () => {
    assert.equal(findNextPendingTask([]), null);
  });
});

describe('readSpec', () => {
  it('returns null for non-existent spec', async () => {
    await withTempDir((dir) => {
      const result = readSpec(dir, 'feat-nonexistent');
      assert.equal(result, null);
    });
  });

  it('reads a spec with tasks only', async () => {
    await withTempDir((dir) => {
      createMockSpec(dir, 'feat-test', {
        tasks: '- [ ] **1.1** Do something `src/a.js`',
      });
      const spec = readSpec(dir, 'feat-test');
      assert.equal(spec.name, 'feat-test');
      assert.equal(spec.tasks.length, 1);
      assert.equal(spec.tasks[0].id, '1.1');
      assert.deepEqual(spec.files, {});
    });
  });

  it('reads a spec with requirements and tasks', async () => {
    await withTempDir((dir) => {
      createMockSpec(dir, 'feat-full', {
        requirements: '# Requirements\n\nSome content here.',
        design: '# Design\n\nArchitecture details.',
        tasks: '- [x] **1.1** Done task',
      });
      const spec = readSpec(dir, 'feat-full');
      assert.ok(spec.files.requirements);
      assert.ok(spec.files.design);
      assert.equal(spec.tasks[0].done, true);
    });
  });
});

describe('parseFrontmatter', () => {
  it('returns null frontmatter when content has none', () => {
    const { frontmatter, body } = parseFrontmatter('# Hello\n\nJust a body.');
    assert.equal(frontmatter, null);
    assert.equal(body, '# Hello\n\nJust a body.');
  });

  it('parses a simple frontmatter block', () => {
    const input = '---\nsource_hash: abc123\ngenerated_at: 2026-04-23T00:00:00Z\n---\n# Body';
    const { frontmatter, body } = parseFrontmatter(input);
    assert.equal(frontmatter.source_hash, 'abc123');
    assert.equal(frontmatter.generated_at, '2026-04-23T00:00:00Z');
    assert.equal(body, '# Body');
  });

  it('strips surrounding quotes from values', () => {
    const input = '---\nname: "quoted value"\nother: \'single\'\n---\nbody';
    const { frontmatter } = parseFrontmatter(input);
    assert.equal(frontmatter.name, 'quoted value');
    assert.equal(frontmatter.other, 'single');
  });

  it('handles CRLF line endings', () => {
    const input = '---\r\nkey: value\r\n---\r\nbody';
    const { frontmatter, body } = parseFrontmatter(input);
    assert.equal(frontmatter.key, 'value');
    assert.equal(body, 'body');
  });

  it('returns null frontmatter and empty body for non-string input', () => {
    const { frontmatter, body } = parseFrontmatter(null);
    assert.equal(frontmatter, null);
    assert.equal(body, '');
  });

  it('ignores blank lines and comments inside the block', () => {
    const input = '---\n# a comment\n\nkey: value\n---\nbody';
    const { frontmatter } = parseFrontmatter(input);
    assert.equal(frontmatter.key, 'value');
    assert.equal(Object.keys(frontmatter).length, 1);
  });
});

describe('stringifyFrontmatter', () => {
  it('returns body unchanged when frontmatter is null or empty', () => {
    assert.equal(stringifyFrontmatter(null, 'body'), 'body');
    assert.equal(stringifyFrontmatter({}, 'body'), 'body');
  });

  it('serializes key-value pairs as YAML-like block', () => {
    const result = stringifyFrontmatter({ a: '1', b: 'hello' }, 'content');
    assert.equal(result, '---\na: 1\nb: hello\n---\ncontent');
  });

  it('roundtrips parse(stringify(fm, body)) back to the original', () => {
    const fm = { source_hash: 'deadbeef', generated_at: '2026-04-23T00:00:00Z' };
    const body = '# Module\n\nPurpose...\n';
    const serialized = stringifyFrontmatter(fm, body);
    const parsed = parseFrontmatter(serialized);
    assert.deepEqual(parsed.frontmatter, fm);
    assert.equal(parsed.body, body);
  });
});

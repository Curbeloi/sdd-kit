import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { archiveCmd, selectForArchive, parseBeforeDate, isCompleted } from './archive.js';
import { readAllSpecs } from '../../core/spec-reader.js';
import { resetConfig } from '../../core/config.js';
import { withTempDir, createMockSpec } from '../../test-helpers.js';

beforeEach(() => resetConfig());

const DONE = '- [x] **1.1** shipped `a.js`';
const TODO = '- [ ] **1.1** pending `a.js`';

function spec(name, tasks, mtime = 0) {
  return {
    name,
    dir: `specs/features/${name}`,
    files: {},
    tasks,
    tasksContent: '',
    mtime,
  };
}
const done = [{ done: true, id: '1.1', desc: 'x', file: null }];
const mixed = [{ done: true, id: '1.1', desc: 'x', file: null }, { done: false, id: '1.2', desc: 'y', file: null }];

describe('isCompleted', () => {
  it('is true only when every task is checked off', () => {
    assert.equal(isCompleted(spec('a', done)), true);
    assert.equal(isCompleted(spec('b', mixed)), false);
  });

  it('is false for a spec with no tasks at all', () => {
    // A spec with an empty tasks.md is unstarted, not finished — archiving it
    // would quietly delete work that was never done.
    assert.equal(isCompleted(spec('c', [])), false);
  });
});

describe('parseBeforeDate', () => {
  it('accepts an ISO date', () => {
    assert.equal(parseBeforeDate('2026-01-01').getTime(), new Date('2026-01-01').getTime());
  });

  it('returns null for junk or missing input', () => {
    assert.equal(parseBeforeDate('not-a-date'), null);
    assert.equal(parseBeforeDate(''), null);
    assert.equal(parseBeforeDate(undefined), null);
  });
});

describe('selectForArchive', () => {
  const specs = [
    spec('feat-old-done', done, new Date('2025-01-01').getTime()),
    spec('feat-new-done', done, new Date('2026-08-01').getTime()),
    spec('feat-old-open', mixed, new Date('2025-01-01').getTime()),
  ];

  it('selects completed specs', () => {
    const picked = selectForArchive(specs, { completed: true }).map(s => s.name);
    assert.deepEqual(picked.sort(), ['feat-new-done', 'feat-old-done']);
  });

  it('selects specs untouched since a date', () => {
    const picked = selectForArchive(specs, { before: new Date('2026-01-01') }).map(s => s.name);
    assert.deepEqual(picked.sort(), ['feat-old-done', 'feat-old-open']);
  });

  it('ANDs the filters when both are given', () => {
    const picked = selectForArchive(specs, { completed: true, before: new Date('2026-01-01') }).map(s => s.name);
    assert.deepEqual(picked, ['feat-old-done']);
  });

  it('selects nothing when no filter matches', () => {
    assert.equal(selectForArchive(specs, { before: new Date('2020-01-01') }).length, 0);
  });
});

describe('archiveCmd — bulk', () => {
  it('removes archived specs from the corpus that arch reads', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-shipped', { tasks: DONE });
      createMockSpec(dir, 'feat-wip', { tasks: TODO });
      assert.equal(readAllSpecs(dir).length, 2);

      archiveCmd({ completed: true, cwd: dir });

      const remaining = readAllSpecs(dir).map(s => s.name);
      assert.deepEqual(remaining, ['feat-wip'], 'archived specs must leave the arch corpus');
      assert.ok(fs.existsSync(path.join(dir, 'specs', 'archived', 'feat-shipped', 'tasks.md')));
    });
  });

  it('moves nothing on --dry-run', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-shipped', { tasks: DONE });
      archiveCmd({ completed: true, dryRun: true, cwd: dir });

      assert.equal(readAllSpecs(dir).length, 1, 'dry run must not move anything');
      assert.ok(!fs.existsSync(path.join(dir, 'specs', 'archived')));
    });
  });

  it('leaves unfinished specs alone', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-wip', { tasks: TODO });
      archiveCmd({ completed: true, cwd: dir });
      assert.deepEqual(readAllSpecs(dir).map(s => s.name), ['feat-wip']);
    });
  });
});

describe('archiveCmd — single spec', () => {
  it('archives and restores a spec round-trip', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-auth', { tasks: DONE });

      archiveCmd({ specName: 'feat-auth', cwd: dir });
      assert.equal(readAllSpecs(dir).length, 0);

      archiveCmd({ specName: 'feat-auth', restore: true, cwd: dir });
      assert.deepEqual(readAllSpecs(dir).map(s => s.name), ['feat-auth']);
    });
  });

  it('reports a missing spec instead of failing silently', async () => {
    await withTempDir(async (dir) => {
      const prev = process.exitCode;
      archiveCmd({ specName: 'feat-nope', cwd: dir });
      assert.equal(process.exitCode, 1);
      process.exitCode = prev;
    });
  });
});

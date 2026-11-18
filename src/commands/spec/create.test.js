import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createCmd } from './create.js';
import { withTempDir } from '../../test-helpers.js';

function filesInSpec(cwd, specName) {
  const dir = path.join(cwd, 'specs', 'features', specName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
}

describe('createCmd default level', () => {
  it('defaults to level 2 (requirements + tasks, no design)', async () => {
    await withTempDir(async (cwd) => {
      await createCmd({ name: 'feat-default', cwd });
      assert.deepEqual(
        filesInSpec(cwd, 'feat-default'),
        ['requirements.md', 'tasks.md'],
      );
    });
  });

  it('level 1 creates only tasks.md', async () => {
    await withTempDir(async (cwd) => {
      await createCmd({ name: 'feat-l1', level: 1, cwd });
      assert.deepEqual(filesInSpec(cwd, 'feat-l1'), ['tasks.md']);
    });
  });

  it('level 3 creates all three files', async () => {
    await withTempDir(async (cwd) => {
      await createCmd({ name: 'feat-l3', level: 3, cwd });
      assert.deepEqual(
        filesInSpec(cwd, 'feat-l3'),
        ['design.md', 'requirements.md', 'tasks.md'],
      );
    });
  });

  it('invalid level falls back to default (level 2)', async () => {
    await withTempDir(async (cwd) => {
      await createCmd({ name: 'feat-bogus', level: 99, cwd });
      assert.deepEqual(
        filesInSpec(cwd, 'feat-bogus'),
        ['requirements.md', 'tasks.md'],
      );
    });
  });

  it('each created file includes header with spec name', async () => {
    await withTempDir(async (cwd) => {
      await createCmd({ name: 'feat-header', description: 'Sample feature', cwd });
      const req = fs.readFileSync(
        path.join(cwd, 'specs', 'features', 'feat-header', 'requirements.md'),
        'utf-8',
      );
      assert.match(req, /# Requirements: feat-header/);
      assert.match(req, /Feature: Sample feature/);
    });
  });
});

describe('createCmd — rejected input', () => {
  // process.exit() skips the CLI's flush-then-exit path, so a rejection could
  // lose its own error message when stdout is a pipe. A rejection must set the
  // exit code and return, like every other command.
  const rejecting = async (fn) => {
    const realExit = process.exit;
    const savedCode = process.exitCode;
    let exitCalled = false;
    process.exit = () => { exitCalled = true; throw new Error('process.exit() was called'); };
    try {
      await fn();
    } catch (err) {
      if (!exitCalled) throw err;
    } finally {
      process.exit = realExit;
    }
    const exitCode = process.exitCode;
    process.exitCode = savedCode;
    return { exitCalled, exitCode };
  };

  it('reports a missing name through the exit code and returns', async () => {
    await withTempDir(async (cwd) => {
      const { exitCalled, exitCode } = await rejecting(() => createCmd({ cwd }));
      assert.equal(exitCalled, false, 'createCmd must not call process.exit()');
      assert.equal(exitCode, 1);
    });
  });

  it('reports a description with no usable characters the same way', async () => {
    await withTempDir(async (cwd) => {
      const { exitCalled, exitCode } = await rejecting(() => createCmd({ description: '!!!', cwd }));
      assert.equal(exitCalled, false, 'createCmd must not call process.exit()');
      assert.equal(exitCode, 1);
    });
  });

  it('reports an existing spec the same way and leaves it untouched', async () => {
    await withTempDir(async (cwd) => {
      await createCmd({ name: 'feat-dup', cwd });
      const file = path.join(cwd, 'specs', 'features', 'feat-dup', 'tasks.md');
      fs.writeFileSync(file, 'edited by hand');
      const { exitCalled, exitCode } = await rejecting(() => createCmd({ name: 'feat-dup', cwd }));
      assert.equal(exitCalled, false, 'createCmd must not call process.exit()');
      assert.equal(exitCode, 1);
      assert.equal(fs.readFileSync(file, 'utf-8'), 'edited by hand');
    });
  });
});

describe('createCmd — header date', () => {
  it('uses the local calendar day, not the UTC one', async (t) => {
    const savedTz = process.env.TZ;
    process.env.TZ = 'America/Guayaquil';   // UTC-5, no daylight saving
    // 22:30 on the 17th in Guayaquil; already the 18th in UTC.
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-18T03:30:00Z') });
    try {
      await withTempDir(async (cwd) => {
        await createCmd({ name: 'feat-date', cwd });
        const tasks = fs.readFileSync(path.join(cwd, 'specs', 'features', 'feat-date', 'tasks.md'), 'utf-8');
        assert.match(tasks, /Created: 2026-11-17\b/);
      });
    } finally {
      if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
    }
  });
});

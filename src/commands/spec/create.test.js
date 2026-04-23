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

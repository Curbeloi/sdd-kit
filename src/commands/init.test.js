import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { initCmd } from './init.js';
import { withTempDir } from '../test-helpers.js';

const MARKER = '<!-- sdd-kit:start -->';

describe('sdd init — instruction files', () => {
  it('creates CLAUDE.md with the SDD block', async () => {
    await withTempDir(async (dir) => {
      await initCmd({ cwd: dir });
      const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
      assert.ok(claude.includes(MARKER), 'CLAUDE.md should contain the SDD marker');
    });
  });

  it('does NOT create AGENTS.md when the project has none', async () => {
    await withTempDir(async (dir) => {
      await initCmd({ cwd: dir });
      assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
    });
  });

  it('mirrors the SDD block into an existing AGENTS.md (opencode)', async () => {
    await withTempDir(async (dir) => {
      const agentsPath = path.join(dir, 'AGENTS.md');
      fs.writeFileSync(agentsPath, '# Agents\n\nProject rules.\n', 'utf-8');
      await initCmd({ cwd: dir });
      const agents = fs.readFileSync(agentsPath, 'utf-8');
      assert.ok(agents.includes('Project rules.'), 'existing content is preserved');
      assert.ok(agents.includes(MARKER), 'AGENTS.md should gain the SDD marker');
    });
  });

  it('is idempotent — re-running does not duplicate the SDD block', async () => {
    await withTempDir(async (dir) => {
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agents\n', 'utf-8');
      await initCmd({ cwd: dir });
      await initCmd({ cwd: dir });
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
      const count = agents.split(MARKER).length - 1;
      assert.equal(count, 1, 'SDD marker should appear exactly once');
    });
  });
});

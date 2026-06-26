import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  initCmd, skillTargets, skillFileFor, ensureSkillFile,
  CLAUDE_SKILL_PATH, GENERIC_SKILL_PATH,
} from './init.js';
import { withTempDir } from '../test-helpers.js';

const MARKER = '<!-- sdd-kit:start -->';

// Deterministic CLI-detection overrides (so tests don't depend on the host).
const CLAUDE_ONLY = { claude: true, opencode: false };
const OPENCODE_ONLY = { claude: false, opencode: true };

describe('sdd init — instruction files', () => {
  it('creates CLAUDE.md with the SDD block', async () => {
    await withTempDir(async (dir) => {
      await initCmd({ cwd: dir, detect: CLAUDE_ONLY });
      const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
      assert.ok(claude.includes(MARKER), 'CLAUDE.md should contain the SDD marker');
    });
  });

  it('does NOT create AGENTS.md when opencode is absent and none exists', async () => {
    await withTempDir(async (dir) => {
      await initCmd({ cwd: dir, detect: CLAUDE_ONLY });
      assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
    });
  });

  it('creates AGENTS.md with the SDD block when opencode is detected', async () => {
    await withTempDir(async (dir) => {
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
      assert.ok(agents.includes(MARKER), 'AGENTS.md should contain the SDD marker');
    });
  });

  it('mirrors the SDD block into an existing AGENTS.md regardless of detection', async () => {
    await withTempDir(async (dir) => {
      const agentsPath = path.join(dir, 'AGENTS.md');
      fs.writeFileSync(agentsPath, '# Agents\n\nProject rules.\n', 'utf-8');
      await initCmd({ cwd: dir, detect: CLAUDE_ONLY });
      const agents = fs.readFileSync(agentsPath, 'utf-8');
      assert.ok(agents.includes('Project rules.'), 'existing content is preserved');
      assert.ok(agents.includes(MARKER), 'AGENTS.md should gain the SDD marker');
    });
  });

  it('is idempotent — re-running does not duplicate the SDD block', async () => {
    await withTempDir(async (dir) => {
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agents\n', 'utf-8');
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
      const count = agents.split(MARKER).length - 1;
      assert.equal(count, 1, 'SDD marker should appear exactly once');
    });
  });
});

describe('skillTargets', () => {
  it('claude → .claude/skills/sdd/SKILL.md', () => {
    assert.deepEqual(skillTargets({ claude: true, opencode: false }), [CLAUDE_SKILL_PATH]);
  });

  it('opencode → skills/sdd/SKILL.md', () => {
    assert.deepEqual(skillTargets({ claude: false, opencode: true }), [GENERIC_SKILL_PATH]);
  });

  it('both → both files', () => {
    assert.deepEqual(skillTargets({ claude: true, opencode: true }), [CLAUDE_SKILL_PATH, GENERIC_SKILL_PATH]);
  });

  it('neither → generic fallback', () => {
    assert.deepEqual(skillTargets({ claude: false, opencode: false }), [GENERIC_SKILL_PATH]);
  });
});

describe('skillFileFor', () => {
  it('maps claude to the .claude path and everything else to generic', () => {
    assert.equal(skillFileFor('claude'), CLAUDE_SKILL_PATH);
    assert.equal(skillFileFor('opencode'), GENERIC_SKILL_PATH);
    assert.equal(skillFileFor('whatever'), GENERIC_SKILL_PATH);
  });
});

describe('ensureSkillFile', () => {
  it('creates a discoverable SKILL.md with frontmatter and is idempotent', async () => {
    await withTempDir(async (dir) => {
      await ensureSkillFile(dir);

      // At least one target is created regardless of which CLIs the host has.
      const claudeFp = path.join(dir, CLAUDE_SKILL_PATH);
      const genericFp = path.join(dir, GENERIC_SKILL_PATH);
      const existing = [claudeFp, genericFp].filter(fs.existsSync);
      assert.ok(existing.length >= 1, 'should create at least one SKILL.md');

      const content = fs.readFileSync(existing[0], 'utf-8');
      assert.ok(content.startsWith('---\nname: sdd'), 'has skill frontmatter');
      assert.ok(content.includes('Spec-Driven Development'), 'has skill body');

      // Re-run: content stays byte-identical (skipped, not rewritten).
      const before = existing.map(fp => fs.readFileSync(fp, 'utf-8'));
      await ensureSkillFile(dir);
      const after = existing.map(fp => fs.readFileSync(fp, 'utf-8'));
      assert.deepEqual(after, before, 'second run is a no-op');
    });
  });
});

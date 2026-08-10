import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  initCmd, ensureSkillFile, sddLayout,
  CLAUDE_SKILL_PATH, SDD_SKILL_PATH, CLAUDE_STEERING_DIR, SDD_STEERING_DIR,
} from './init.js';
import { resetConfig } from '../core/config.js';
import { readSteering } from '../core/spec-reader.js';
import { withTempDir } from '../test-helpers.js';

const MARKER = '<!-- sdd-kit:start -->';

// Deterministic CLI-detection overrides (so tests don't depend on the host).
const CLAUDE_ONLY = { claude: true, opencode: false };
const OPENCODE_ONLY = { claude: false, opencode: true };

describe('sdd init — instruction files', () => {
  it('creates CLAUDE.md with the SDD block', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
      await initCmd({ cwd: dir, detect: CLAUDE_ONLY });
      const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
      assert.ok(claude.includes(MARKER), 'CLAUDE.md should contain the SDD marker');
    });
  });

  it('does NOT create AGENTS.md when opencode is absent and none exists', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
      await initCmd({ cwd: dir, detect: CLAUDE_ONLY });
      assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
    });
  });

  it('creates AGENTS.md with the SDD block when opencode is detected', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
      assert.ok(agents.includes(MARKER), 'AGENTS.md should contain the SDD marker');
    });
  });

  it('mirrors the SDD block into an existing AGENTS.md regardless of detection', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
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
      resetConfig();
      fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agents\n', 'utf-8');
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
      const count = agents.split(MARKER).length - 1;
      assert.equal(count, 1, 'SDD marker should appear exactly once');
    });
  });
});

describe('sddLayout', () => {
  it('uses .claude/ when Claude Code is present', () => {
    assert.deepEqual(sddLayout({ claude: true }), { steeringDir: CLAUDE_STEERING_DIR, skillFile: CLAUDE_SKILL_PATH });
  });

  it('uses a root sdd/ folder when Claude Code is absent', () => {
    assert.deepEqual(sddLayout({ claude: false }), { steeringDir: SDD_STEERING_DIR, skillFile: SDD_SKILL_PATH });
  });
});

describe('ensureSkillFile', () => {
  it('writes .claude/skills/sdd/SKILL.md with Claude Code, idempotently', async () => {
    await withTempDir(async (dir) => {
      await ensureSkillFile(dir, CLAUDE_ONLY);
      const fp = path.join(dir, CLAUDE_SKILL_PATH);
      assert.ok(fs.existsSync(fp), 'creates the .claude skill');
      assert.equal(fs.existsSync(path.join(dir, SDD_SKILL_PATH)), false, 'no sdd/ skill');

      const content = fs.readFileSync(fp, 'utf-8');
      assert.ok(content.startsWith('---\nname: sdd'), 'has skill frontmatter');
      assert.ok(content.includes('Spec-Driven Development'), 'has skill body');

      const before = fs.readFileSync(fp, 'utf-8');
      await ensureSkillFile(dir, CLAUDE_ONLY);
      assert.equal(fs.readFileSync(fp, 'utf-8'), before, 'second run is a no-op');
    });
  });

  it('writes sdd/SKILL.md when Claude Code is absent', async () => {
    await withTempDir(async (dir) => {
      await ensureSkillFile(dir, OPENCODE_ONLY);
      assert.ok(fs.existsSync(path.join(dir, SDD_SKILL_PATH)), 'creates the sdd/ skill');
      assert.equal(fs.existsSync(path.join(dir, CLAUDE_SKILL_PATH)), false, 'no .claude skill');
    });
  });
});

describe('sdd init — file layout', () => {
  it('with Claude Code: everything under .claude/, no sdd/', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
      await initCmd({ cwd: dir, detect: CLAUDE_ONLY });
      assert.ok(fs.existsSync(path.join(dir, CLAUDE_STEERING_DIR, 'product.md')), 'steering under .claude/');
      assert.ok(fs.existsSync(path.join(dir, CLAUDE_SKILL_PATH)), 'skill under .claude/');
      assert.equal(fs.existsSync(path.join(dir, 'sdd')), false, 'no root sdd/ folder');
    });
  });

  it('without Claude Code: everything under sdd/, no .claude/', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      assert.ok(fs.existsSync(path.join(dir, SDD_STEERING_DIR, 'product.md')), 'steering under sdd/');
      assert.ok(fs.existsSync(path.join(dir, SDD_SKILL_PATH)), 'skill under sdd/');
      assert.equal(fs.existsSync(path.join(dir, '.claude')), false, 'no .claude/ folder');
    });
  });

  it('persists steering_dir to .sddrc so readSteering finds sdd/steering (no Claude Code)', async () => {
    await withTempDir(async (dir) => {
      resetConfig();
      await initCmd({ cwd: dir, detect: OPENCODE_ONLY });
      const rc = JSON.parse(fs.readFileSync(path.join(dir, '.sddrc'), 'utf-8'));
      assert.equal(rc.steering_dir, SDD_STEERING_DIR);

      resetConfig();
      const steering = readSteering(dir);
      assert.ok(steering.product, 'readSteering reads docs from sdd/steering');
    });
  });
});

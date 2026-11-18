/**
 * arch.test.js — what `sdd arch` says about the agentic CLI it used.
 * Runs the real binary with only stand-in agents on PATH (see test-helpers).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withTempDir, createMockSpec, sddWithAgents } from '../test-helpers.js';

const SPEC = { requirements: '# Requirements: a\n\nDo the thing.', tasks: '- [ ] **1.1** build it `a.js`' };
const arch = (dir, args, opts) => sddWithAgents(dir, ['arch', ...args], opts);

describe('sdd arch — agent CLI', () => {
  it('names the binary it looked for when it falls back to prompt-only, and exits 0', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', SPEC);
      const { code, out } = await arch(dir, [], { agents: [], env: { SDD_AGENT_CLI: 'opencode' } });
      assert.equal(code, 0, out);
      assert.match(out, /opencode[^\n]*not found/i);
      assert.doesNotMatch(out, /Claude Code/);
    });
  });

  it('does not report a missing CLI when --prompt-only was asked for', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', SPEC);
      const { code, out } = await arch(dir, ['--prompt-only']);
      assert.equal(code, 0, out);
      assert.doesNotMatch(out, /not found/i);
    });
  });

  it('does not call opencode "Claude Code" when it runs', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', SPEC);
      const { code, out } = await arch(dir, [], { agents: ['opencode'], env: { SDD_AGENT_CLI: 'opencode' } });
      assert.equal(code, 0, out);
      assert.match(out, /opencode/);
      assert.doesNotMatch(out, /Claude Code/);
    });
  });
});

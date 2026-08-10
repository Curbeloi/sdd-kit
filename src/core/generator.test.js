import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Mode, detectMode, AGENT_CLIS, parseOpencodeEvent } from './generator.js';
import { resetConfig } from './config.js';

beforeEach(() => resetConfig());

describe('detectMode', () => {
  it('returns PROMPT when promptOnly is true (no CLI probe)', async () => {
    const mode = await detectMode(true);
    assert.equal(mode, Mode.PROMPT);
  });
});

describe('AGENT_CLIS registry', () => {
  it('exposes claude and opencode descriptors', () => {
    assert.equal(AGENT_CLIS.claude.command, 'claude');
    assert.equal(AGENT_CLIS.opencode.command, 'opencode');
    assert.equal(AGENT_CLIS.claude.parse, 'stream-json');
    assert.equal(AGENT_CLIS.opencode.parse, 'opencode-json');
  });

  it('every descriptor can build args and declares a version probe', () => {
    for (const [, d] of Object.entries(AGENT_CLIS)) {
      assert.ok(Array.isArray(d.versionArgs));
      const args = d.buildArgs({ prompt: 'x' });
      assert.ok(Array.isArray(args) && args.length > 0);
    }
  });

  it('opencode buildArgs requests JSON output and non-interactive run', () => {
    const args = AGENT_CLIS.opencode.buildArgs({ prompt: 'do it', model: 'anthropic/claude' });
    const i = args.indexOf('--format');
    assert.ok(i >= 0 && args[i + 1] === 'json', 'should pass --format json');
    assert.ok(args.includes('--dangerously-skip-permissions'));
  });
});

describe('parseOpencodeEvent', () => {
  it('extracts text parts with their id', () => {
    const u = parseOpencodeEvent({ type: 'message.part.updated', part: { type: 'text', id: 'p1', text: 'hello' } });
    assert.deepEqual(u, { kind: 'text', id: 'p1', text: 'hello' });
  });

  it('extracts tool progress with a detail', () => {
    const u = parseOpencodeEvent({ type: 'message.part.updated', part: { type: 'tool', name: 'Read', state: 'running' } });
    assert.equal(u.kind, 'tool');
    assert.equal(u.name, 'Read');
    assert.equal(u.detail, 'running');
  });

  it('flags thinking parts', () => {
    assert.equal(parseOpencodeEvent({ type: 'message.part.updated', part: { type: 'thinking' } }).kind, 'thinking');
  });

  it('extracts cost from step-finish', () => {
    assert.deepEqual(parseOpencodeEvent({ type: 'step-finish', cost: 0.01 }), { kind: 'cost', cost: 0.01 });
  });

  it('returns null for unknown / malformed events', () => {
    assert.equal(parseOpencodeEvent({ type: 'whatever' }), null);
    assert.equal(parseOpencodeEvent(null), null);
    assert.equal(parseOpencodeEvent({ type: 'message.part.updated' }), null);
  });
});

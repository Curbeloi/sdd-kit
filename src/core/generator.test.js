import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Mode, detectMode, AGENT_CLIS, parseOpencodeEvent, extractAgentError } from './generator.js';
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

describe('extractAgentError', () => {
  // Verbatim shape of what `claude -p --output-format stream-json` emits when the
  // request is rejected: exit code 1, stderr *completely empty*, and the only
  // diagnosis on stdout. The old handler read stderr alone and reported
  // "unknown error", which is what made this failure impossible to act on.
  const OVERSIZED_PROMPT_STDOUT = [
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Prompt is too long' }] },
      error: 'invalid_request',
      is_api_error_message: true,
    }),
    JSON.stringify({
      type: 'result', subtype: 'success', is_error: true,
      result: 'Prompt is too long', total_cost_usd: 0,
    }),
  ].join('\n');

  it('recovers the real message from stdout when stderr is empty', () => {
    const { message } = extractAgentError(OVERSIZED_PROMPT_STDOUT, '');
    assert.match(message, /Prompt is too long/);
    assert.ok(!/unknown error/.test(message));
  });

  it('flags an oversized prompt so callers can suggest a remedy', () => {
    assert.equal(extractAgentError(OVERSIZED_PROMPT_STDOUT, '').promptTooLong, true);
  });

  it('does not flag unrelated failures as prompt-too-long', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance too low' });
    const { message, promptTooLong } = extractAgentError(stdout, '');
    assert.match(message, /Credit balance too low/);
    assert.equal(promptTooLong, false);
  });

  it('recognises other context-overflow phrasings', () => {
    for (const phrase of [
      'maximum context length exceeded',
      'request_too_large',
      'too many tokens in the request',
    ]) {
      const stdout = JSON.stringify({ type: 'result', is_error: true, result: phrase });
      assert.equal(extractAgentError(stdout, '').promptTooLong, true, `not detected: ${phrase}`);
    }
  });

  it('prefers stderr content when the CLI writes there', () => {
    const { message } = extractAgentError('', 'command not found: claude');
    assert.match(message, /command not found/);
  });

  it('falls back to raw stdout when nothing is structured', () => {
    const { message } = extractAgentError('segfault at 0xdeadbeef', '');
    assert.match(message, /segfault/);
  });

  it('says so plainly when the process produced nothing at all', () => {
    const { message } = extractAgentError('', '');
    assert.match(message, /no output/);
  });

  it('survives partial and non-JSON lines without throwing', () => {
    const stdout = 'not json\n{"type":"result","is_error":true,"result":"boom"}\n{"partial":';
    assert.match(extractAgentError(stdout, '').message, /boom/);
  });

  it('does not repeat the same message twice', () => {
    const { message } = extractAgentError(OVERSIZED_PROMPT_STDOUT, '');
    assert.equal(message.match(/Prompt is too long/g).length, 1);
  });
});

describe('extractAgentError — non-context failures', () => {
  // Real shape from a run that exceeded --max-budget-usd: no `result` string and
  // no api-error turn, so the naive fallback dumped a raw JSON line at the user.
  const BUDGET_STDOUT = JSON.stringify({
    type: 'result', subtype: 'error_max_budget_usd', is_error: true,
    terminal_reason: 'budget_exhausted',
    errors: ['Reached maximum budget ($1)'],
    modelUsage: { 'claude-sonnet-5': { contextWindow: 1000000, maxOutputTokens: 64000 } },
  });

  it('reads the errors[] array instead of dumping raw JSON', () => {
    const { message } = extractAgentError(BUDGET_STDOUT, '');
    assert.equal(message, 'Reached maximum budget ($1)');
    assert.ok(!message.includes('contextWindow'), 'must not leak the raw event');
  });

  it('classifies a spend cap separately from a context overflow', () => {
    const { promptTooLong, budgetExhausted } = extractAgentError(BUDGET_STDOUT, '');
    assert.equal(budgetExhausted, true);
    assert.equal(promptTooLong, false);
  });

  it('falls back to the error subtype when no message is carried', () => {
    const stdout = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true });
    assert.equal(extractAgentError(stdout, '').message, 'error_during_execution');
  });
});

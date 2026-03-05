/**
 * claude-api.js — Unified Claude client with two engines:
 *
 * 1. SDK mode (fast): Uses @anthropic-ai/sdk directly via API key
 *    - ~5s per request, parallel-friendly
 *    - Requires: ANTHROPIC_API_KEY env var
 *
 * 2. CLI mode (fallback): Uses `claude -p` CLI
 *    - Uses your Claude Code subscription (Pro/Max)
 *    - Slower due to process startup overhead
 *    - Optimized with: --model sonnet, --effort low, --no-session-persistence
 *
 * Auto-detects: SDK if API key exists, otherwise CLI.
 */

import { spawn } from 'child_process';

let _sdk = null;
let _mode = null; // 'sdk' | 'cli' | null

/**
 * Detect which engine is available. SDK takes priority (faster).
 */
export function detectEngine() {
  if (_mode) return _mode;

  if (process.env.ANTHROPIC_API_KEY) {
    _mode = 'sdk';
  } else {
    _mode = 'cli';
  }
  return _mode;
}

export function getEngineName() {
  const m = detectEngine();
  return m === 'sdk' ? 'Anthropic API (fast)' : 'Claude Code CLI';
}

/**
 * Get or create the SDK client (lazy).
 */
async function getSdkClient() {
  if (_sdk) return _sdk;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  _sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _sdk;
}

/**
 * Send a prompt and get text back.
 * Automatically uses SDK or CLI depending on what's available.
 *
 * @param {string} prompt
 * @param {object} opts
 * @param {number} opts.maxTokens - Max output tokens (default: 2000)
 * @param {string} opts.cwd - Working directory (for CLI mode)
 * @returns {Promise<string>}
 */
export async function askClaude(prompt, { maxTokens = 2000, cwd } = {}) {
  const engine = detectEngine();

  if (engine === 'sdk') {
    return askSdk(prompt, { maxTokens });
  }
  return askCli(prompt, { cwd, maxTokens });
}

/**
 * Batch multiple prompts in parallel.
 * SDK mode: true parallel HTTP requests.
 * CLI mode: limited parallel processes.
 *
 * @param {Array<{prompt: string, label: string}>} items
 * @param {object} opts
 * @param {number} opts.concurrency - Max parallel (default: 4 SDK, 2 CLI)
 * @param {number} opts.maxTokens
 * @param {string} opts.cwd
 * @param {function} opts.onItemDone - Callback(label, result|null, index, error?)
 * @returns {Promise<Array<{label: string, result?: string, error?: string}>>}
 */
export async function batchAsk(items, { concurrency, maxTokens = 2000, cwd, onItemDone } = {}) {
  const engine = detectEngine();
  const maxConcurrency = concurrency || (engine === 'sdk' ? 4 : 2);

  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const { prompt, label } = items[i];
      try {
        const result = await askClaude(prompt, { maxTokens, cwd });
        results[i] = { label, result };
        if (onItemDone) onItemDone(label, result, i);
      } catch (err) {
        results[i] = { label, error: err.message };
        if (onItemDone) onItemDone(label, null, i, err);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ─── SDK engine ───────────────────────────────────────────────────────────

async function askSdk(prompt, { maxTokens }) {
  const client = await getSdkClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// ─── CLI engine ───────────────────────────────────────────────────────────

function askCli(prompt, { cwd, maxTokens }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'text',
      '--model', 'sonnet',
      '--effort', 'low',
      '--no-session-persistence',
      '--max-budget-usd', '0.5',
    ];

    // Remove CLAUDECODE env var to avoid "nested session" block
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn('claude', args, {
      cwd: cwd || process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],  // close stdin so claude doesn't hang
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(stderr || `claude exit ${code}`));
      else resolve(stdout.trim());
    });
    proc.on('error', (err) => reject(err));

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('timeout (5 min)'));
    }, 300000);
  });
}

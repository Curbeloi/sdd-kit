/**
 * claude-api.js — Facade over the LLM provider layer (src/core/providers/).
 *
 * Public surface (unchanged signatures — consumers in init/refresh/document
 * keep working):
 *   - detectEngine(cwd)   → resolved provider name
 *   - getEngineName(cwd)  → human-readable provider label
 *   - askClaude(prompt, opts)
 *   - batchAsk(items, opts)
 *
 * Providers (Anthropic SDK, OpenAI-compatible, Claude CLI) and selection logic
 * live in src/core/providers/. This file just wires them to the existing API.
 */

import { getConfig } from './config.js';
import { DEFAULT_MAX_TOKENS } from './providers/provider.js';
import { selectProvider, resolveProviderName } from './providers/index.js';

/**
 * Resolved provider name ('anthropic' | 'openai' | 'ollama' | 'vllm' | 'claude-cli').
 */
export function detectEngine(cwd = process.cwd()) {
  return resolveProviderName(cwd);
}

/**
 * Human-readable label for the active provider (for status lines).
 */
export function getEngineName(cwd = process.cwd()) {
  return selectProvider(cwd).label;
}

// Process-based providers can't fan out as wide as HTTP ones.
function isProcessProvider(name) {
  return name === 'claude-cli';
}

/**
 * Send a prompt and get text back via the active provider.
 *
 * @param {string} prompt
 * @param {object} opts
 * @param {number} opts.maxTokens - Max output tokens (default: 2000)
 * @param {string} opts.cwd - Working directory (for CLI provider)
 * @returns {Promise<string>}
 */
export async function askClaude(prompt, { maxTokens = DEFAULT_MAX_TOKENS, cwd } = {}) {
  const provider = selectProvider(cwd);
  return provider.ask(prompt, { maxTokens, cwd });
}

/**
 * Batch multiple prompts with a bounded worker pool.
 * HTTP providers fan out to the configured concurrency; the CLI provider is capped.
 *
 * @param {Array<{prompt: string, label: string}>} items
 * @param {object} opts
 * @param {number} opts.concurrency - Max parallel (default: config, capped for CLI)
 * @param {number} opts.maxTokens
 * @param {string} opts.cwd
 * @param {function} opts.onItemDone - Callback(label, result|null, index, error?)
 * @returns {Promise<Array<{label: string, result?: string, error?: string}>>}
 */
export async function batchAsk(items, { concurrency, maxTokens = DEFAULT_MAX_TOKENS, cwd, onItemDone } = {}) {
  const provider = selectProvider(cwd);
  const configConcurrency = getConfig(cwd).concurrency;
  const maxConcurrency = concurrency ||
    (isProcessProvider(provider.name) ? Math.min(configConcurrency, 2) : configConcurrency);

  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const { prompt, label } = items[i];
      try {
        const result = await provider.ask(prompt, { maxTokens, cwd });
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

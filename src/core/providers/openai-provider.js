/**
 * openai-provider.js — OpenAI-compatible Chat Completions.
 *
 * One implementation serves OpenAI, Ollama, and vLLM — they all speak the same
 * API; only baseURL / apiKey / model differ (resolved by index.js). The `openai`
 * package is an optional, lazily-imported dependency.
 */

import { debugLog } from '../log.js';
import { REQUEST_TIMEOUT_MS } from './provider.js';

let _client = null;
let _clientKey = null; // baseURL|apiKey — rebuild client when settings change

async function getClient(baseURL, apiKey) {
  const key = `${baseURL}|${apiKey}`;
  if (_client && _clientKey === key) return _client;
  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (err) {
    debugLog('openai-provider', `openai import failed: ${err.message}`);
    throw new Error('Could not load the "openai" package. Install it with: pnpm add openai');
  }
  // Ollama and other keyless endpoints still require a non-empty string.
  _client = new OpenAI({ baseURL, apiKey: apiKey || 'not-needed', timeout: REQUEST_TIMEOUT_MS });
  _clientKey = key;
  return _client;
}

export const name = 'openai';

export function isAvailable() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * @param {object} opts
 * @param {number} opts.maxTokens
 * @param {string} opts.baseURL    - OpenAI-compatible endpoint
 * @param {string} opts.apiKey     - resolved API key (may be empty for local endpoints)
 * @param {string} opts.model      - required; the chat model name
 * @param {string} opts.tokenParam - 'max_tokens' (default) or 'max_completion_tokens'.
 *                                    Newer OpenAI models reject max_tokens; Ollama/vLLM use it.
 */
export async function ask(prompt, { maxTokens, baseURL, apiKey, model, tokenParam = 'max_tokens' } = {}) {
  if (!model) {
    throw new Error('No model configured for the OpenAI-compatible provider. Set `model` in .sddrc (or SDD_MODEL), e.g. "gpt-4o" / "llama3.1".');
  }
  const client = await getClient(baseURL, apiKey);
  const base = { model, messages: [{ role: 'user', content: prompt }] };
  const primary = tokenParam === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens';
  const alternate = primary === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';

  const send = (param) => client.chat.completions.create({ ...base, [param]: maxTokens });

  try {
    const response = await send(primary);
    return response.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    // If the endpoint rejects the param we sent and names the other, retry once.
    const msg = String(err?.message || '');
    if (maxTokens && msg.includes(alternate)) {
      debugLog('openai-provider', `Retrying with ${alternate} (endpoint rejected ${primary})`);
      const response = await send(alternate);
      return response.choices?.[0]?.message?.content ?? '';
    }
    throw err;
  }
}

// Test seam: reset the cached client.
export function _reset() { _client = null; _clientKey = null; }

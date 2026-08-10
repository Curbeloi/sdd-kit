/**
 * anthropic-provider.js — Native Anthropic SDK (@anthropic-ai/sdk).
 *
 * Moved here from the old claude-api.js `askSdk`. Uses the native SDK (never an
 * OpenAI-compatible shim) so Claude-specific behavior stays correct.
 */

import { debugLog } from '../log.js';
import { REQUEST_TIMEOUT_MS, ANTHROPIC_DEFAULT_MODEL } from './provider.js';

let _sdk = null;

async function getClient() {
  if (_sdk) return _sdk;
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch (err) {
    debugLog('anthropic-provider', `SDK import failed: ${err.message}`);
    throw new Error('Could not load @anthropic-ai/sdk. Install it with: pnpm add @anthropic-ai/sdk');
  }
  _sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _sdk;
}

export const name = 'anthropic';

export function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function ask(prompt, { maxTokens, model } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && !apiKey.startsWith('sk-')) {
    throw new Error(`Invalid ANTHROPIC_API_KEY — expected key starting with "sk-", got "${apiKey.slice(0, 6)}..."`);
  }

  const client = await getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await client.messages.create({
      model: model || ANTHROPIC_DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }, { signal: controller.signal });

    return response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Anthropic SDK request timed out (5 min)');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Test seam: reset the cached client.
export function _reset() { _sdk = null; }

/**
 * providers/index.js — Provider selection and binding.
 *
 * Resolves the configured (or auto-detected) provider and returns a bound
 * provider whose `ask(prompt, { maxTokens, cwd })` closes over the resolved
 * model / endpoint / key. Config resolution lives here; providers stay thin.
 */

import { getConfig } from '../config.js';
import { OPENAI_COMPATIBLE } from './provider.js';
import * as anthropic from './anthropic-provider.js';
import * as openai from './openai-provider.js';
import * as cli from './cli-provider.js';

const LABELS = {
  anthropic: 'Anthropic API (fast)',
  openai: 'OpenAI API',
  ollama: 'Ollama (OpenAI-compatible)',
  vllm: 'vLLM (OpenAI-compatible)',
  'claude-cli': 'Claude Code CLI',
};

// Human-readable provider labels and the supported set (for `sdd provider`).
export const PROVIDER_LABELS = LABELS;
export const SUPPORTED_PROVIDERS = Object.keys(LABELS);

/**
 * Decide which provider to use given config + environment.
 * @returns {'anthropic'|'openai'|'ollama'|'vllm'|'claude-cli'}
 */
export function resolveProviderName(cwd = process.cwd()) {
  const { provider } = getConfig(cwd);
  if (provider && provider !== 'auto') return provider;
  // auto-detect
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'claude-cli';
}

/**
 * Return a bound provider for the resolved selection.
 * @returns {{ name: string, label: string, ask(prompt: string, opts?: object): Promise<string> }}
 */
export function selectProvider(cwd = process.cwd()) {
  const config = getConfig(cwd);
  const providerName = resolveProviderName(cwd);
  const label = LABELS[providerName] || providerName;

  if (providerName === 'anthropic') {
    return {
      name: providerName,
      label,
      ask: (prompt, { maxTokens } = {}) =>
        anthropic.ask(prompt, { maxTokens, model: config.model }),
    };
  }

  if (providerName === 'openai' || providerName === 'ollama' || providerName === 'vllm') {
    const variant = OPENAI_COMPATIBLE[providerName];
    const baseURL = config.baseUrl || variant.baseUrl;
    const apiKeyEnv = config.apiKeyEnv || variant.apiKeyEnv;
    const apiKey = apiKeyEnv ? (process.env[apiKeyEnv] || '') : '';
    // OpenAI's newer models require max_completion_tokens; Ollama/vLLM use max_tokens.
    // (openai-provider retries with the other if the endpoint disagrees.)
    const tokenParam = providerName === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    return {
      name: providerName,
      label,
      ask: (prompt, { maxTokens } = {}) =>
        openai.ask(prompt, { maxTokens, baseURL, apiKey, model: config.model, tokenParam }),
    };
  }

  // claude-cli
  return {
    name: 'claude-cli',
    label,
    ask: (prompt, { maxTokens, cwd: askCwd } = {}) =>
      cli.ask(prompt, { cwd: askCwd, maxTokens, model: config.model || 'sonnet' }),
  };
}

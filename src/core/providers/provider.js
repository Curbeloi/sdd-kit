/**
 * provider.js — Shared contract and constants for LLM text-generation providers.
 *
 * A provider is a thin transport that turns a prompt into text. Config
 * resolution (which provider, which model, which endpoint) lives in index.js;
 * each provider just implements `ask`.
 *
 * Provider shape:
 *   {
 *     name: string,                              // 'anthropic' | 'openai' | 'claude-cli'
 *     ask(prompt, { maxTokens, cwd, ...settings }): Promise<string>
 *   }
 *
 * `selectProvider(cwd)` (index.js) returns a bound provider:
 *   { name, label, async ask(prompt, { maxTokens, cwd }): Promise<string> }
 */

export const REQUEST_TIMEOUT_MS = 300000; // 5 min
export const DEFAULT_MAX_TOKENS = 2000;

// Default Anthropic SDK model (the current Sonnet; replaces the deprecated
// claude-sonnet-4-20250514 snapshot). Override via `model` in .sddrc / SDD_MODEL.
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-6';

// OpenAI-compatible variant defaults. One provider implementation (openai-provider)
// serves all three; only baseURL / api key / model differ.
export const OPENAI_COMPATIBLE = {
  openai: { baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY' },
  ollama: { baseUrl: 'http://localhost:11434/v1', apiKeyEnv: '' /* keyless; dummy used */ },
  vllm:   { baseUrl: 'http://localhost:8000/v1',  apiKeyEnv: 'OPENAI_API_KEY' },
};

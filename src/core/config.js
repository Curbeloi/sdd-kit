/**
 * config.js — Centralized configuration with .sddrc support.
 *
 * Priority: CLI flags > .sddrc > env vars > defaults
 */

import fs from 'fs';
import path from 'path';
import { debugLog } from './log.js';
import { DEFAULT_ARCH_PROMPT_BUDGET } from './arch-prompt.js';

const DEFAULTS = {
  specs_dir: 'specs/features',
  modules_dir: 'specs/_map',
  steering_dir: '.claude/steering',
  arch_dir: 'specs/_arch',
  concurrency: 4,
  max_file_size: 50 * 1024,
  max_depth: 8,
  // LLM provider (text-generation layer)
  provider: 'auto',   // auto | anthropic | openai | ollama | vllm | claude-cli
  model: '',          // empty = per-provider default (Anthropic SDK -> claude-sonnet-4-6)
  base_url: '',        // OpenAI-compatible endpoint (openai/ollama/vllm)
  api_key_env: '',     // env var name holding the API key (per-provider default if empty)
  // Agentic execution layer (spec create/execute/arch)
  agent_cli: 'claude',  // claude | opencode
  agent_model: '',      // empty = inherit the CLI's own default (claude: Claude Code default). Else an alias (sonnet|opus|haiku|...)
};

// Env var fallback for the provider-related keys (.sddrc still wins over env).
const ENV_KEYS = {
  provider: 'SDD_PROVIDER',
  model: 'SDD_MODEL',
  base_url: 'SDD_BASE_URL',
  api_key_env: 'SDD_API_KEY_ENV',
  agent_cli: 'SDD_AGENT_CLI',
  agent_model: 'SDD_AGENT_MODEL',
};

let _cache = null;
let _cacheCwd = null;
let _overrides = {}; // highest-precedence values (e.g. from CLI flags)

/**
 * Read .sddrc from project root. Returns parsed object or empty.
 */
function readRcFile(cwd) {
  const rcPath = path.join(cwd, '.sddrc');
  if (!fs.existsSync(rcPath)) return {};

  try {
    const raw = fs.readFileSync(rcPath, 'utf-8');
    const parsed = JSON.parse(raw);
    debugLog('config', `Loaded .sddrc from ${rcPath}`);
    return parsed;
  } catch (err) {
    debugLog('config', `Failed to parse .sddrc: ${err.message}`);
    return {};
  }
}

/**
 * Get merged configuration. Lazy-loaded and cached per cwd.
 * @param {string} [cwd] - Project root directory
 * @returns {object} Configuration object with resolved values
 */
export function getConfig(cwd = process.cwd()) {
  if (_cache && _cacheCwd === cwd) return _cache;

  const rc = readRcFile(cwd);

  // Resolve a provider key: CLI override > .sddrc > env var > default.
  const sources = {};
  const resolve = (key) => {
    if (_overrides[key] !== undefined && _overrides[key] !== '') { sources[key] = 'cli'; return _overrides[key]; }
    if (rc[key] !== undefined) { sources[key] = '.sddrc'; return rc[key]; }
    const envName = ENV_KEYS[key];
    if (envName && process.env[envName] !== undefined && process.env[envName] !== '') {
      sources[key] = 'env';
      return process.env[envName];
    }
    sources[key] = 'default';
    return DEFAULTS[key];
  };

  _cache = {
    specsDir:     rc.specs_dir     ?? DEFAULTS.specs_dir,
    modulesDir:   rc.modules_dir   ?? DEFAULTS.modules_dir,
    steeringDir:  rc.steering_dir  ?? DEFAULTS.steering_dir,
    archDir:      rc.arch_dir      ?? DEFAULTS.arch_dir,
    concurrency:  rc.concurrency   ?? DEFAULTS.concurrency,
    maxFileSize:  rc.max_file_size ?? DEFAULTS.max_file_size,
    maxDepth:     rc.max_depth     ?? DEFAULTS.max_depth,
    // LLM provider config (.sddrc > env > default)
    provider:    resolve('provider'),
    model:       resolve('model'),
    baseUrl:     resolve('base_url'),
    apiKeyEnv:   resolve('api_key_env'),
    agentCli:    resolve('agent_cli'),
    agentModel:  resolve('agent_model'),
    // Track sources for `sdd config` display
    _sources: {},
  };

  // Sources for the original keys (.sddrc vs default)
  for (const key of ['specs_dir', 'modules_dir', 'steering_dir', 'arch_dir', 'concurrency', 'max_file_size', 'max_depth']) {
    _cache._sources[key] = rc[key] !== undefined ? '.sddrc' : 'default';
  }
  // Sources for provider keys (already computed in resolve)
  Object.assign(_cache._sources, sources);

  _cacheCwd = cwd;
  return _cache;
}

/**
 * Reset cached config (useful for testing).
 */
export function resetConfig() {
  _cache = null;
  _cacheCwd = null;
  _overrides = {};
}

/**
 * Apply highest-precedence config overrides (e.g. from CLI flags like
 * --provider / --model). Only non-empty values are applied. Invalidates the cache.
 * Accepts snake_case config keys: provider, model, base_url, api_key_env, agent_cli, agent_model.
 */
export function setOverrides(overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null && value !== '') _overrides[key] = value;
  }
  _cache = null;
  _cacheCwd = null;
}

/**
 * Get default values (for display/reference).
 */
export function getDefaults() {
  return { ...DEFAULTS };
}

/**
 * Merge `updates` into the project's `.sddrc` (creating it if absent) and
 * persist as pretty-printed JSON. Empty-string/null/undefined values are
 * dropped (so callers can "unset" a key by passing ''). Only the provided keys
 * change — everything else in `.sddrc` is preserved. Invalidates the cache.
 *
 * @param {string} cwd
 * @param {Record<string, any>} updates - snake_case config keys
 * @returns {Record<string, any>} the merged object that was written
 */
export function writeRc(cwd, updates = {}) {
  const rcPath = path.join(cwd, '.sddrc');
  let current = {};
  if (fs.existsSync(rcPath)) {
    try { current = JSON.parse(fs.readFileSync(rcPath, 'utf-8')); }
    catch { current = {}; }
  }

  const merged = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (value === '' || value === null || value === undefined) delete merged[key];
    else merged[key] = value;
  }

  fs.writeFileSync(rcPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  resetConfig();
  return merged;
}

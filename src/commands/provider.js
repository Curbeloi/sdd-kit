/**
 * sdd provider — inspect, switch, and configure the LLM provider.
 *
 *   sdd provider list                       show providers + the active one
 *   sdd provider set <provider> [flags]     persist a provider to .sddrc
 *   sdd provider models [--provider <name>] list models from the active endpoint
 */

import chalk from 'chalk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getConfig, writeRc } from '../core/config.js';
import {
  resolveProviderName, SUPPORTED_PROVIDERS, PROVIDER_LABELS,
} from '../core/providers/index.js';
import { OPENAI_COMPATIBLE } from '../core/providers/provider.js';
import { cliAvailable } from '../core/cli-detect.js';

const execFileAsync = promisify(execFile);

// ─── list ──────────────────────────────────────────────────────────────────

export function providerListCmd({ cwd = process.cwd() } = {}) {
  const config = getConfig(cwd);
  const active = resolveProviderName(cwd);
  const source = config._sources.provider || 'default';
  const autoNote = config.provider === 'auto' ? ', auto-detected' : '';

  console.log(`\n${chalk.bold('sdd provider list')}\n`);
  for (const name of SUPPORTED_PROVIDERS) {
    const isActive = name === active;
    const mark = isActive ? chalk.green('✓') : ' ';
    const nameStr = isActive ? chalk.bold.cyan(name.padEnd(12)) : chalk.dim(name.padEnd(12));
    const label = chalk.dim(PROVIDER_LABELS[name]);
    const tag = isActive ? chalk.cyan(`  ← active (${source}${autoNote})`) : '';
    const modelStr = isActive && config.model ? chalk.dim(`  model=${config.model}`) : '';
    console.log(`  ${mark} ${nameStr} ${label}${modelStr}${tag}`);
  }
  console.log(chalk.dim('\n  Switch:  sdd provider set <provider> [--model <m>]'));
  console.log(chalk.dim('  Models:  sdd provider models\n'));
}

// ─── set ───────────────────────────────────────────────────────────────────

export function providerSetCmd({ provider, model, baseUrl, apiKeyEnv, cwd = process.cwd() } = {}) {
  const valid = [...SUPPORTED_PROVIDERS, 'auto'];
  if (!provider || !valid.includes(provider)) {
    console.error(chalk.red(`\n  Unknown provider: ${provider || '(none)'}`));
    console.log(chalk.dim(`  Valid: ${valid.join(', ')}\n`));
    process.exitCode = 1;
    return;
  }

  const updates = { provider };
  if (model !== undefined) updates.model = model;
  if (baseUrl !== undefined) updates.base_url = baseUrl;
  if (apiKeyEnv !== undefined) updates.api_key_env = apiKeyEnv;

  const merged = writeRc(cwd, updates);

  console.log(`\n${chalk.bold('sdd provider set')} — ${chalk.cyan(provider)}\n`);
  console.log(chalk.green('  Wrote .sddrc:'));
  console.log(chalk.dim('  ' + JSON.stringify(merged, null, 2).replace(/\n/g, '\n  ')));

  if (['openai', 'ollama', 'vllm'].includes(provider) && !merged.model) {
    console.log(chalk.yellow(`\n  ⚠ No model set for ${provider}. Add one:`));
    console.log(chalk.dim(`    sdd provider set ${provider} --model <name>`));
  }
  console.log(chalk.dim('\n  Verify:  sdd doctor\n'));
}

// ─── models ──────────────────────────────────────────────────────────────────

/**
 * Fetch the list of model IDs from a provider's `/models` endpoint.
 * Pure transport: throws on network / non-2xx so callers decide how to report.
 * @param {{providerName: string, baseURL?: string, apiKey?: string, timeoutMs?: number}} opts
 * @returns {Promise<string[]>}
 */
export async function fetchModels({ providerName, baseURL, apiKey, timeoutMs = 8000 }) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is unavailable on this Node runtime (requires Node >= 18)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url, headers;
    if (providerName === 'anthropic') {
      url = 'https://api.anthropic.com/v1/models';
      headers = { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' };
    } else {
      url = `${(baseURL || '').replace(/\/$/, '')}/models`;
      headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    }
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from ${url}${body ? ` — ${body.slice(0, 160)}` : ''}`);
    }
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    return list.map(m => m.id || m.name).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

function printModels(models) {
  if (!models.length) { console.log(chalk.dim('  (no models returned)')); return; }
  for (const id of models) console.log(`    ${id}`);
  console.log(chalk.dim(`  ${models.length} model(s)`));
}

async function listOpencodeModels() {
  try {
    const { stdout } = await execFileAsync('opencode', ['models'], { timeout: 10000 });
    const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { console.log(chalk.dim('    (none reported)')); return; }
    for (const l of lines.slice(0, 100)) console.log(`    ${l}`);
  } catch (err) {
    console.log(chalk.dim(`    run \`opencode models\` to list (${err.code || err.message})`));
  }
}

export async function providerModelsCmd({ provider: override, cwd = process.cwd() } = {}) {
  const config = getConfig(cwd);
  const providerName = override || resolveProviderName(cwd);

  console.log(`\n${chalk.bold('sdd provider models')} — ${chalk.cyan(providerName)}\n`);

  try {
    if (providerName === 'claude-cli') {
      console.log(chalk.dim('  Claude Code CLI uses model aliases (no listing endpoint):'));
      for (const a of ['sonnet', 'opus', 'haiku']) console.log(`    ${a}`);
    } else if (providerName === 'anthropic') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        console.log(chalk.yellow('  ANTHROPIC_API_KEY not set — cannot list models.'));
      } else {
        printModels(await fetchModels({ providerName, apiKey: key }));
      }
    } else {
      const variant = OPENAI_COMPATIBLE[providerName] || {};
      const baseURL = config.baseUrl || variant.baseUrl;
      const apiKeyEnv = config.apiKeyEnv || variant.apiKeyEnv;
      const apiKey = apiKeyEnv ? (process.env[apiKeyEnv] || '') : '';
      console.log(chalk.dim(`  endpoint: ${baseURL}`));
      printModels(await fetchModels({ providerName, baseURL, apiKey }));
    }
  } catch (err) {
    console.log(chalk.red(`  Could not list models: ${err.message}`));
  }

  // Agentic layer: list opencode models when it's the configured CLI or present.
  if (config.agentCli === 'opencode' || await cliAvailable('opencode')) {
    console.log(`\n${chalk.dim('  opencode (agentic CLI):')}`);
    await listOpencodeModels();
  }

  console.log('');
}

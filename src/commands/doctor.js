/**
 * sdd doctor — validate the active LLM provider and agentic CLI setup.
 *
 * Runs per-layer checks (API key / package / endpoint / model / CLI on PATH) and
 * prints a ✓/✗ checklist with actionable hints. Returns true if everything passes.
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getConfig } from '../core/config.js';
import { resolveProviderName } from '../core/providers/index.js';
import { OPENAI_COMPATIBLE, ANTHROPIC_DEFAULT_MODEL } from '../core/providers/provider.js';
import { cliAvailable } from '../core/cli-detect.js';
import { skillFileFor } from './init.js';

async function endpointReachable(baseURL) {
  if (typeof fetch !== 'function') return null; // can't check on this runtime
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    // Any HTTP response (even 401/404) proves the host is up; only a network
    // error or 5xx means "unreachable".
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/models`, { signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function openaiInstalled() {
  try { await import('openai'); return true; } catch { return false; }
}

function printCheck({ ok, label, detail, hint }) {
  const mark = ok ? chalk.green('✓') : chalk.red('✗');
  const d = detail ? chalk.dim(`  (${detail})`) : '';
  console.log(`  ${mark} ${label}${d}`);
  if (!ok && hint) console.log(`      ${chalk.yellow('→ ' + hint)}`);
}

export async function doctorCmd({ cwd = process.cwd() } = {}) {
  const config = getConfig(cwd);
  const providerName = resolveProviderName(cwd);
  const providerSrc = config._sources.provider || 'default';

  console.log(`\n${chalk.bold('sdd doctor')} — ${chalk.cyan('provider & agentic CLI checks')}\n`);
  console.log(chalk.dim(`  text provider: ${providerName} (${providerSrc})   agentic CLI: ${config.agentCli}\n`));

  const checks = [];

  // ── Text-generation layer ──
  if (providerName === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    checks.push({ ok: !!key, label: 'ANTHROPIC_API_KEY set', hint: 'export ANTHROPIC_API_KEY=sk-...' });
    if (key) checks.push({ ok: key.startsWith('sk-'), label: 'API key format', detail: key.slice(0, 6) + '…', hint: 'Anthropic keys start with "sk-"' });
    checks.push({ ok: true, label: `model = ${config.model || ANTHROPIC_DEFAULT_MODEL + ' (default)'}` });
  } else if (providerName === 'claude-cli') {
    checks.push({ ok: await cliAvailable('claude'), label: 'claude CLI on PATH', hint: 'Install Claude Code: npm i -g @anthropic-ai/claude-code' });
    checks.push({ ok: true, label: `model = ${config.model || 'sonnet (default)'}` });
  } else {
    // OpenAI-compatible (openai / ollama / vllm)
    const variant = OPENAI_COMPATIBLE[providerName] || {};
    const baseURL = config.baseUrl || variant.baseUrl;
    const apiKeyEnv = config.apiKeyEnv || variant.apiKeyEnv;
    checks.push({ ok: await openaiInstalled(), label: 'openai package installed', hint: 'pnpm add openai' });
    checks.push({ ok: !!config.model, label: config.model ? `model = ${config.model}` : 'model not set', hint: 'set `model` in .sddrc or pass --model' });
    if (apiKeyEnv) {
      checks.push({ ok: !!process.env[apiKeyEnv], label: `${apiKeyEnv} set`, hint: `export ${apiKeyEnv}=...` });
    } else {
      checks.push({ ok: true, label: 'no API key required (keyless endpoint)' });
    }
    const reach = await endpointReachable(baseURL);
    if (reach === null) {
      checks.push({ ok: true, label: `endpoint (reachability not checked)`, detail: baseURL });
    } else {
      checks.push({ ok: reach, label: 'endpoint reachable', detail: baseURL, hint: 'is the service running and the URL/port correct?' });
    }
  }

  // ── Agentic execution layer ──
  const agentCmd = config.agentCli === 'opencode' ? 'opencode' : 'claude';
  checks.push({
    ok: await cliAvailable(agentCmd),
    label: `agentic CLI "${agentCmd}" on PATH`,
    detail: `model=${config.agentModel || 'inherit'}`,
    hint: agentCmd === 'opencode' ? 'install opencode, or set agent_cli=claude' : 'install Claude Code, or commands fall back to --prompt-only',
  });

  // SDD skill file discoverable by the active agentic CLI.
  const skillRel = skillFileFor(agentCmd);
  checks.push({
    ok: fs.existsSync(path.join(cwd, skillRel)),
    label: 'SDD skill file present',
    detail: skillRel,
    hint: 'run `sdd init` to create it',
  });

  console.log('');
  checks.forEach(printCheck);

  const allOk = checks.every(c => c.ok);
  console.log('\n' + (allOk
    ? chalk.green('  All checks passed.')
    : chalk.yellow('  Some checks failed — see hints above.')) + '\n');
  return allOk;
}

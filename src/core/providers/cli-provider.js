/**
 * cli-provider.js — Claude Code CLI (`claude -p`) text generation.
 *
 * Moved here from the old claude-api.js `askCli`. Uses your Claude Code
 * subscription. `model` is a Claude Code alias (sonnet|opus|haiku|...).
 */

import { spawn } from 'child_process';
import { REQUEST_TIMEOUT_MS } from './provider.js';

export const name = 'claude-cli';

export function isAvailable() {
  // Availability is determined by selectProvider (auto-mode fallback) and the
  // generator's own CLI detection; treat as available by default here.
  return true;
}

export function ask(prompt, { cwd, model = 'sonnet' } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'text',
      '--model', model,
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
      stdio: ['ignore', 'pipe', 'pipe'],
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
      reject(new Error('claude CLI timed out (5 min)'));
    }, REQUEST_TIMEOUT_MS);
  });
}

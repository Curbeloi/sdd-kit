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
    let timer;
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    // Single exit path: the timer and the child's pipes are handles, and any one
    // of them left behind keeps the CLI alive after its work is done.
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const s of [proc.stdout, proc.stderr]) {
        if (s && !s.destroyed) s.destroy();
      }
      proc.removeAllListeners();
      proc.on('error', () => {});   // a failed kill emits 'error'; unhandled, it throws
      // Only reached when we settle before the child does (timeout): terminate
      // it, escalating if it ignores SIGTERM.
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGTERM');
        const killTimer = setTimeout(() => proc.kill('SIGKILL'), 5000);
        killTimer.unref();
      }
      proc.unref();
      fn(value);
    };

    proc.on('close', (code) => {
      if (code !== 0) settle(reject, new Error(stderr.trim() || stdout.trim().slice(-400) || `claude exit ${code}`));
      else settle(resolve, stdout.trim());
    });
    proc.on('error', (err) => settle(reject, err));

    timer = setTimeout(() => {
      settle(reject, new Error('claude CLI timed out (5 min)'));   // settle() kills the child
    }, REQUEST_TIMEOUT_MS);
    timer.unref();   // the child handle already keeps the loop alive while it runs
  });
}

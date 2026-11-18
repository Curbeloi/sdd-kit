/**
 * test-helpers.js — Shared utilities for unit tests.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'bin', 'sdd.js');

const EXIT_TIMEOUT_MS = 20000;

/**
 * Create a temporary directory, run fn(tmpDir), then clean up.
 * @param {function(string): Promise<void>} fn
 */
export async function withTempDir(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-test-'));
  try {
    await fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Scaffold a mock spec in a temp directory for testing.
 * @param {string} dir - Base directory
 * @param {string} specName - Spec name (e.g. 'feat-test')
 * @param {object} files - { requirements?: string, design?: string, tasks?: string }
 * @param {object} [opts]
 * @param {string} [opts.type] - Type folder under specs/ (default 'features')
 */
export function createMockSpec(dir, specName, files = {}, { type = 'features' } = {}) {
  const specDir = path.join(dir, 'specs', type, specName);
  fs.mkdirSync(specDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(specDir, `${name}.md`), content, 'utf-8');
  }

  return specDir;
}

/**
 * Run a node process and resolve when it exits. Rejects — rather than hanging
 * the suite — if it outlives `timeoutMs`, which is the failure being guarded.
 * stdio is piped, so this also exercises the non-TTY flush path where an
 * over-eager `process.exit()` would truncate output.
 */
export function run(args, { cwd = process.cwd(), timeoutMs = EXIT_TIMEOUT_MS, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, SDD_LANG: 'en', NO_COLOR: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(
        `process still alive after ${timeoutMs}ms — it printed its result but never exited.\n` +
        `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
      ));
    }, timeoutMs);

    proc.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/** Run the real `sdd` binary. */
export const sdd = (args, opts) => run([CLI, ...args], opts);

/**
 * Run `sdd <args>` in `dir` with only the named stand-in agents on PATH, so the
 * outcome never depends on which CLIs the host has. `agents: []` is a machine
 * with no agentic CLI at all. Returns the exit code and stdout+stderr together
 * (spinners write to stderr, plain messages to stdout).
 */
export async function sddWithAgents(dir, args, { agents = ['claude'], env = {} } = {}) {
  const bin = path.join(dir, '.bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const name of agents) installFakeAgent(bin, name);
  const { code, stdout, stderr } = await sdd(args, {
    cwd: dir,
    // Blank out host settings that would change which agent runs or its cap.
    env: { PATH: bin, SDD_AGENT_CLI: '', SDD_AGENT_MAX_BUDGET_USD: '', ...env },
  });
  return { code, out: stdout + stderr };
}

// A stand-in for an agentic CLI (`claude`, `opencode`). It takes the prompt the
// way the real one does — stdin for `claude -p`, argv for `opencode run <prompt>`
// — and acts only on what that prompt says, as a real agent would:
//   FAKE_AGENT_MARK=1   tick the task the prompt names, in the tasks.md it names
//   FAKE_AGENT_LOG=file write { args, prompt } there
const FAKE_AGENT_SOURCE = String.raw`
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('0.0.0-fake'); process.exit(0); }

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => {
  const prompt = args[0] === 'run' ? args[1] : stdin;
  if (process.env.FAKE_AGENT_LOG) {
    fs.writeFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify({ args, prompt }));
  }
  if (process.env.FAKE_AGENT_MARK === '1') {
    const id = /Execute task (\S+?):/.exec(prompt)[1];
    const tasksPath = /[\w.\/-]+tasks\.md/.exec(prompt)[0];
    const before = fs.readFileSync(tasksPath, 'utf8');
    fs.writeFileSync(tasksPath, before.replace('- [ ] **' + id + '**', '- [x] **' + id + '**'));
  }
  console.log(JSON.stringify({ type: 'result', result: 'done', total_cost_usd: 0.01 }));
});
`;

/**
 * Install the stand-in agent as `binDir/<name>`. Put `binDir` alone on PATH and
 * the host's real `claude`/`opencode` can never answer in its place; the
 * shebang is absolute so the script itself needs nothing from PATH.
 */
export function installFakeAgent(binDir, name = 'claude') {
  fs.mkdirSync(binDir, { recursive: true });
  const file = path.join(binDir, name);
  fs.writeFileSync(file, `#!${process.execPath}\n${FAKE_AGENT_SOURCE}`, { mode: 0o755 });
  return file;
}

/**
 * cli.test.js — Process-lifetime regression tests.
 *
 * `sdd arch` used to finish its work, print every line of its result, and then
 * sit there forever: a cosmetic 1s spinner interval was never cleared because
 * the completion event it waited for only fired when the CLI reported a cost
 * field it had since renamed. Output was complete, files were on disk, and the
 * process still had to be killed by hand — indistinguishable from "still
 * working", so it was routinely left running for an hour.
 *
 * These tests encode the invariant that regression violated: a command that has
 * printed its result must exit on its own, and must not lose output doing it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { withTempDir, createMockSpec, run, sdd } from './test-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_URL = pathToFileURL(path.join(__dirname, 'core', 'progress.js')).href;

describe('CLI process lifetime', () => {
  it('exits after --version', async () => {
    const { code, stdout } = await sdd(['--version']);
    assert.equal(code, 0);
    assert.match(stdout, /\d+\.\d+\.\d+/);
  });

  it('exits after --help without truncating the piped output', async () => {
    const { code, stdout } = await sdd(['--help']);
    assert.equal(code, 0);
    // The help text ends with the spec-levels block; a truncated flush loses it.
    assert.match(stdout, /Spec levels:/);
    assert.match(stdout, /full spec/);
  });

  it('exits after `config`', async () => {
    await withTempDir(async (dir) => {
      const { code } = await sdd(['config'], { cwd: dir });
      assert.equal(code, 0);
    });
  });

  it('exits after `spec list`', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', { tasks: '- [x] **1.1** done `a.js`' });
      const { code } = await sdd(['spec', 'list'], { cwd: dir });
      assert.equal(code, 0);
    });
  });

  it('exits after `spec status`', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', { tasks: '- [ ] **1.1** todo `a.js`' });
      const { code } = await sdd(['spec', 'status'], { cwd: dir });
      assert.equal(code, 0);
    });
  });

  it('exits after `arch --prompt-only` and writes its output', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', {
        requirements: '# Requirements: a\n\nDo the thing.',
        tasks: '- [ ] **1.1** build it `a.js`',
      });
      const { code, stdout } = await sdd(['arch', '--prompt-only'], { cwd: dir });
      assert.equal(code, 0);
      assert.match(stdout, /arch_prompt\.md/);
    });
  });

  it('exits after a bulk archive dry run', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-done', { tasks: '- [x] **1.1** done `a.js`' });
      const { code, stdout } = await sdd(['spec', 'archive', '--completed', '--dry-run'], { cwd: dir });
      assert.equal(code, 0);
      assert.match(stdout, /feat-done/);
    });
  });

  it('exits non-zero — and still exits — on an unknown command', async () => {
    const { code } = await sdd(['definitely-not-a-command']);
    assert.notEqual(code, 0);
  });
});

describe('progress heartbeat', () => {
  it('never keeps the process alive when the done event never arrives', async () => {
    // The exact Bug 1 mechanism: a heartbeat started and left running because
    // completion was signalled from an event field that no longer existed.
    // With the interval unref'd, the process must still exit on its own.
    const script = `
      const { createProgress } = await import(${JSON.stringify(PROGRESS_URL)});
      const spinner = { text: 'working', suffixText: '', isSpinning: true };
      createProgress(spinner);
      // Deliberately never call progress({ done: true }).
    `;
    const { code } = await run(['--input-type=module', '-e', script], { timeoutMs: 10000 });
    assert.equal(code, 0);
  });

  it('stop() is safe to call twice and after completion', async () => {
    const script = `
      const { createProgress } = await import(${JSON.stringify(PROGRESS_URL)});
      const spinner = { text: 'working', suffixText: '', isSpinning: true };
      const progress = createProgress(spinner);
      progress({ done: true, cost: 0.01 });
      progress.stop();
      progress.stop();
    `;
    const { code, stderr } = await run(['--input-type=module', '-e', script], { timeoutMs: 10000 });
    assert.equal(code, 0, stderr);
  });
});

describe('exit codes', () => {
  // `sdd ... && next-step` must not run next-step after a failure. These all
  // used to print an error and exit 0.
  it('spec status exits non-zero for a missing spec', async () => {
    await withTempDir(async (dir) => {
      const { code, stderr } = await sdd(['spec', 'status', 'feat-nope'], { cwd: dir });
      assert.notEqual(code, 0);
      assert.match(stderr, /not found/i);
    });
  });

  it('spec rename exits non-zero for a missing spec', async () => {
    await withTempDir(async (dir) => {
      const { code } = await sdd(['spec', 'rename', 'feat-nope', 'feat-new'], { cwd: dir });
      assert.notEqual(code, 0);
    });
  });

  it('spec delete exits non-zero for a missing spec', async () => {
    await withTempDir(async (dir) => {
      const { code } = await sdd(['spec', 'delete', 'feat-nope', '--force'], { cwd: dir });
      assert.notEqual(code, 0);
    });
  });

  it('spec execute exits non-zero for a missing spec', async () => {
    await withTempDir(async (dir) => {
      const { code } = await sdd(['spec', 'execute', 'feat-nope'], { cwd: dir });
      assert.notEqual(code, 0);
    });
  });

  it('spec document exits non-zero for a missing path', async () => {
    await withTempDir(async (dir) => {
      const { code } = await sdd(['spec', 'document', 'no/such/dir'], { cwd: dir });
      assert.notEqual(code, 0);
    });
  });

  it('spec refresh exits non-zero when the provider is unreachable', async () => {
    await withTempDir(async (dir) => {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'export const a = 1;\n');
      const { code } = await sdd(
        ['spec', 'refresh', 'src', '--force', '--provider', 'openai', '--model', 'x'],
        { cwd: dir, env: { OPENAI_API_KEY: 'dummy', SDD_BASE_URL: 'http://localhost:59999/v1' } },
      );
      assert.notEqual(code, 0);
    });
  });

  it('a successful command still exits 0', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-a', { tasks: '- [x] **1.1** done `a.js`' });
      const { code } = await sdd(['spec', 'status', 'feat-a'], { cwd: dir });
      assert.equal(code, 0);
    });
  });
});

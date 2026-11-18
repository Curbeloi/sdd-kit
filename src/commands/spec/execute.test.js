/**
 * execute.test.js — `sdd spec execute` against a stand-in agentic CLI.
 *
 * These run the real binary. The stand-in (see `installFakeAgent`) is the only
 * thing on PATH, so the outcome never depends on which CLIs the host has, and
 * it acts only on the prompt it receives — if the prompt stops naming the right
 * tasks.md, the stand-in cannot tick the task, exactly like a real agent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { withTempDir, createMockSpec, sddWithAgents } from '../../test-helpers.js';

const TASKS = '# Tasks: x\n\n- [ ] **1.1** build it `a.js`\n- [ ] **1.2** test it\n';

/** `sdd spec execute <args>` in `dir`, with only the named stand-in agents on PATH. */
const execute = (dir, args, opts) => sddWithAgents(dir, ['spec', 'execute', ...args], opts);

const readTasks = (specDir) => fs.readFileSync(path.join(specDir, 'tasks.md'), 'utf-8');

describe('sdd spec execute — after the agent runs', () => {
  it('exits 0 once the agent has ticked the task, in a type-folder spec', async () => {
    await withTempDir(async (dir) => {
      const specDir = createMockSpec(dir, 'fix-login', { tasks: TASKS }, { type: 'bugfix' });
      const { code, out } = await execute(dir, ['fix-login'], { env: { FAKE_AGENT_MARK: '1' } });
      assert.equal(code, 0, out);
      assert.match(readTasks(specDir), /^- \[x\] \*\*1\.1\*\*/m);
    });
  });

  it('exits 1 and names the task and its tasks.md when the agent leaves it unchecked', async () => {
    await withTempDir(async (dir) => {
      const specDir = createMockSpec(dir, 'feat-x', { tasks: TASKS });
      const { code, out } = await execute(dir, ['feat-x']);
      assert.equal(code, 1, out);
      assert.match(out, /1\.1[^\n]*specs\/features\/feat-x\/tasks\.md/);
      assert.match(readTasks(specDir), /^- \[ \] \*\*1\.1\*\*/m, 'sdd must not tick the task itself');
    });
  });
});

describe('sdd spec execute — nothing to run', () => {
  it('exits 1 on a spec whose tasks.md defines no tasks', async () => {
    await withTempDir(async (dir) => {
      // What `sdd spec create` writes: a header and nothing else.
      createMockSpec(dir, 'feat-new', {
        tasks: '# Tasks: feat-new\n\n<!-- Fill this spec with your AI assistant -->\n',
      });
      const { code, out } = await execute(dir, ['feat-new']);
      assert.equal(code, 1, out);
      assert.doesNotMatch(out, /complete/i);
    });
  });

  it('still exits 0 when every task is done', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-done', { tasks: '- [x] **1.1** done `a.js`\n' });
      const { code, out } = await execute(dir, ['feat-done']);
      assert.equal(code, 0, out);
    });
  });

  it('exits 1 when --task names an id that is not in the spec', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', { tasks: TASKS });
      const { code, out } = await execute(dir, ['feat-x', '--task', '9.9']);
      assert.equal(code, 1, out);
    });
  });

  it('shows, with its line number, a checkbox line it could not read as a task', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', {
        tasks: '# Tasks\n\n- [ ] **1.1** ok\n* [ ] **1.2** star bullet\n',
      });
      const { out } = await execute(dir, ['feat-x', '--dry-run']);
      assert.match(out, /\b4\b[^\n]*\* \[ \] \*\*1\.2\*\* star bullet/);
    });
  });
});

describe('sdd spec execute — agent CLI', () => {
  it('says which binary it looked for when it falls back to prompt-only, and exits 0', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', { tasks: TASKS });
      const { code, out } = await execute(dir, ['feat-x'], {
        agents: [],
        env: { SDD_AGENT_CLI: 'opencode' },
      });
      assert.equal(code, 0, out);
      assert.match(out, /opencode[^\n]*not found/i);
      assert.doesNotMatch(out, /Claude Code/);
    });
  });

  it('does not call opencode "Claude Code"', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', { tasks: TASKS });
      const { code, out } = await execute(dir, ['feat-x'], {
        agents: ['opencode'],
        env: { SDD_AGENT_CLI: 'opencode', FAKE_AGENT_MARK: '1' },
      });
      assert.equal(code, 0, out);
      assert.match(out, /opencode/);
      assert.doesNotMatch(out, /Claude Code/);
    });
  });
});

describe('sdd spec execute — spend cap', () => {
  const agentArgs = async (dir) => {
    const log = path.join(dir, 'agent.json');
    const { code, out } = await execute(dir, ['feat-x'], {
      env: { FAKE_AGENT_MARK: '1', FAKE_AGENT_LOG: log },
    });
    assert.equal(code, 0, out);
    return JSON.parse(fs.readFileSync(log, 'utf-8')).args;
  };

  it('passes agent_max_budget_usd to the agent when the project sets it', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', { tasks: TASKS });
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({ agent_max_budget_usd: 2.5 }));
      const args = await agentArgs(dir);
      const i = args.indexOf('--max-budget-usd');
      assert.ok(i >= 0, `no --max-budget-usd in ${JSON.stringify(args)}`);
      assert.equal(args[i + 1], '2.5');
    });
  });

  it('sets no cap when the project leaves the default', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', { tasks: TASKS });
      const args = await agentArgs(dir);
      assert.ok(!args.includes('--max-budget-usd'), JSON.stringify(args));
    });
  });
});

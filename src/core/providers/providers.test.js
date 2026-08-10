import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { resetConfig } from '../config.js';
import { resolveProviderName, selectProvider } from './index.js';
import * as openai from './openai-provider.js';
import * as anthropic from './anthropic-provider.js';
import { AGENT_CLIS } from '../generator.js';
import { withTempDir } from '../../test-helpers.js';

// Snapshot/restore env so tests don't leak provider detection state.
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'SDD_PROVIDER', 'SDD_MODEL', 'SDD_BASE_URL', 'SDD_AGENT_CLI'];
let saved;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  resetConfig();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetConfig();
});

describe('resolveProviderName (auto detection)', () => {
  it('uses anthropic when ANTHROPIC_API_KEY is set', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.ANTHROPIC_API_KEY = 'sk-test';
      assert.equal(resolveProviderName(dir), 'anthropic');
    });
  });

  it('uses openai when only OPENAI_API_KEY is set', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.OPENAI_API_KEY = 'sk-openai';
      assert.equal(resolveProviderName(dir), 'openai');
    });
  });

  it('falls back to claude-cli when no key is set', async () => {
    await withTempDir((dir) => {
      resetConfig();
      assert.equal(resolveProviderName(dir), 'claude-cli');
    });
  });

  it('explicit provider in .sddrc overrides auto-detection', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.ANTHROPIC_API_KEY = 'sk-test'; // would auto-detect anthropic
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({ provider: 'ollama' }), 'utf-8');
      assert.equal(resolveProviderName(dir), 'ollama');
    });
  });
});

describe('selectProvider', () => {
  it('binds anthropic with a readable label', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.ANTHROPIC_API_KEY = 'sk-test';
      const p = selectProvider(dir);
      assert.equal(p.name, 'anthropic');
      assert.match(p.label, /Anthropic/);
      assert.equal(typeof p.ask, 'function');
    });
  });

  it('binds the ollama variant', async () => {
    await withTempDir((dir) => {
      resetConfig();
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({ provider: 'ollama', model: 'llama3.1' }), 'utf-8');
      const p = selectProvider(dir);
      assert.equal(p.name, 'ollama');
      assert.match(p.label, /Ollama/);
    });
  });
});

describe('anthropic-provider', () => {
  it('isAvailable reflects ANTHROPIC_API_KEY', () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(anthropic.isAvailable(), false);
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    assert.equal(anthropic.isAvailable(), true);
  });
});

describe('openai-provider', () => {
  it('throws an actionable error when no model is configured', async () => {
    await assert.rejects(
      openai.ask('hello', { maxTokens: 10, baseURL: 'http://localhost:11434/v1', apiKey: '', model: '' }),
      /No model configured/
    );
  });
});

describe('agentic CLI descriptors (generator.AGENT_CLIS)', () => {
  it('claude buildArgs includes model and budget when provided', () => {
    const args = AGENT_CLIS.claude.buildArgs({ prompt: 'hi', model: 'sonnet', allowedTools: 'Read', maxBudget: 0.5 });
    assert.deepEqual(args.slice(0, 2), ['-p', 'hi']);
    assert.ok(args.includes('--model'));
    assert.equal(args[args.indexOf('--model') + 1], 'sonnet');
    assert.ok(args.includes('--max-budget-usd'));
    assert.equal(args[args.indexOf('--max-budget-usd') + 1], '0.5');
    assert.ok(args.includes('--output-format'));
  });

  it('claude buildArgs omits --model when model is empty (inherit default)', () => {
    const args = AGENT_CLIS.claude.buildArgs({ prompt: 'hi', model: '', maxBudget: 0.5 });
    assert.ok(!args.includes('--model'));
  });

  it('opencode buildArgs uses the run subcommand', () => {
    const args = AGENT_CLIS.opencode.buildArgs({ prompt: 'do it', model: 'anthropic/claude' });
    assert.equal(args[0], 'run');
    assert.equal(args[1], 'do it');
    assert.ok(args.includes('--model'));
  });
});

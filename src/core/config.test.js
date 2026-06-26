import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { getConfig, resetConfig, getDefaults, setOverrides } from './config.js';
import { withTempDir } from '../test-helpers.js';

beforeEach(() => {
  resetConfig();
});

describe('getConfig', () => {
  it('returns defaults when no .sddrc exists', async () => {
    await withTempDir((dir) => {
      resetConfig();
      const config = getConfig(dir);
      assert.equal(config.specsDir, 'specs/features');
      assert.equal(config.modulesDir, 'specs/_map');
      assert.equal(config.steeringDir, '.claude/steering');
      assert.equal(config.archDir, 'specs/_arch');
      assert.equal(config.concurrency, 4);
      assert.equal(config.maxFileSize, 50 * 1024);
      assert.equal(config.maxDepth, 8);
    });
  });

  it('reads overrides from .sddrc', async () => {
    await withTempDir((dir) => {
      resetConfig();
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({
        concurrency: 2,
        max_depth: 5,
      }), 'utf-8');
      const config = getConfig(dir);
      assert.equal(config.concurrency, 2);
      assert.equal(config.maxDepth, 5);
      // Non-overridden values stay at default
      assert.equal(config.specsDir, 'specs/features');
    });
  });

  it('tracks sources correctly', async () => {
    await withTempDir((dir) => {
      resetConfig();
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({
        concurrency: 8,
      }), 'utf-8');
      const config = getConfig(dir);
      assert.equal(config._sources.concurrency, '.sddrc');
      assert.equal(config._sources.specs_dir, 'default');
    });
  });

  it('handles invalid JSON in .sddrc gracefully', async () => {
    await withTempDir((dir) => {
      resetConfig();
      fs.writeFileSync(path.join(dir, '.sddrc'), 'not json {', 'utf-8');
      const config = getConfig(dir);
      // Should fall back to defaults
      assert.equal(config.concurrency, 4);
    });
  });

  it('caches config per cwd', async () => {
    await withTempDir((dir) => {
      resetConfig();
      const config1 = getConfig(dir);
      const config2 = getConfig(dir);
      assert.equal(config1, config2); // Same reference
    });
  });
});

describe('getDefaults', () => {
  it('returns all default values', () => {
    const defaults = getDefaults();
    assert.equal(defaults.specs_dir, 'specs/features');
    assert.equal(defaults.concurrency, 4);
    assert.equal(defaults.max_file_size, 50 * 1024);
  });
});

describe('LLM provider config', () => {
  const PROV_ENV = ['SDD_PROVIDER', 'SDD_MODEL', 'SDD_AGENT_CLI'];
  let savedEnv;
  beforeEach(() => {
    savedEnv = {};
    for (const k of PROV_ENV) { savedEnv[k] = process.env[k]; delete process.env[k]; }
    resetConfig();
  });
  // restore after each test
  const restore = () => {
    for (const k of PROV_ENV) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  };

  it('provides provider/model/agent defaults', async () => {
    await withTempDir((dir) => {
      resetConfig();
      const config = getConfig(dir);
      assert.equal(config.provider, 'auto');
      assert.equal(config.model, '');
      assert.equal(config.agentCli, 'claude');
      assert.equal(config.agentModel, '');
      restore();
    });
  });

  it('reads provider keys from .sddrc', async () => {
    await withTempDir((dir) => {
      resetConfig();
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({
        provider: 'ollama', model: 'llama3.1', base_url: 'http://localhost:11434/v1', agent_cli: 'opencode',
      }), 'utf-8');
      const config = getConfig(dir);
      assert.equal(config.provider, 'ollama');
      assert.equal(config.model, 'llama3.1');
      assert.equal(config.baseUrl, 'http://localhost:11434/v1');
      assert.equal(config.agentCli, 'opencode');
      assert.equal(config._sources.provider, '.sddrc');
      restore();
    });
  });

  it('falls back to env vars and marks the source as env', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.SDD_PROVIDER = 'openai';
      const config = getConfig(dir);
      assert.equal(config.provider, 'openai');
      assert.equal(config._sources.provider, 'env');
      restore();
    });
  });

  it('.sddrc wins over env vars', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.SDD_PROVIDER = 'openai';
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({ provider: 'anthropic' }), 'utf-8');
      const config = getConfig(dir);
      assert.equal(config.provider, 'anthropic');
      assert.equal(config._sources.provider, '.sddrc');
      restore();
    });
  });

  it('CLI overrides win over .sddrc and env, marked as cli', async () => {
    await withTempDir((dir) => {
      resetConfig();
      process.env.SDD_PROVIDER = 'openai';
      fs.writeFileSync(path.join(dir, '.sddrc'), JSON.stringify({ provider: 'anthropic', model: 'x' }), 'utf-8');
      setOverrides({ provider: 'vllm', model: 'my-model' });
      const config = getConfig(dir);
      assert.equal(config.provider, 'vllm');
      assert.equal(config.model, 'my-model');
      assert.equal(config._sources.provider, 'cli');
      restore();
    });
  });

  it('empty override values are ignored', async () => {
    await withTempDir((dir) => {
      resetConfig();
      setOverrides({ provider: '', model: undefined });
      const config = getConfig(dir);
      assert.equal(config.provider, 'auto'); // falls through to default
      restore();
    });
  });

  it('resetConfig clears overrides', async () => {
    await withTempDir((dir) => {
      setOverrides({ provider: 'ollama' });
      resetConfig();
      const config = getConfig(dir);
      assert.equal(config.provider, 'auto');
      restore();
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { providerSetCmd, fetchModels } from './provider.js';
import { resetConfig } from '../core/config.js';
import { withTempDir } from '../test-helpers.js';

describe('providerSetCmd', () => {
  it('writes provider + model to .sddrc', async () => {
    await withTempDir((dir) => {
      resetConfig();
      providerSetCmd({ provider: 'openai', model: 'gpt-4o', cwd: dir });
      const rc = JSON.parse(fs.readFileSync(path.join(dir, '.sddrc'), 'utf-8'));
      assert.equal(rc.provider, 'openai');
      assert.equal(rc.model, 'gpt-4o');
    });
  });

  it('persists base_url and api_key_env', async () => {
    await withTempDir((dir) => {
      resetConfig();
      providerSetCmd({ provider: 'vllm', model: 'm', baseUrl: 'http://h:8000/v1', apiKeyEnv: 'VLLM_KEY', cwd: dir });
      const rc = JSON.parse(fs.readFileSync(path.join(dir, '.sddrc'), 'utf-8'));
      assert.equal(rc.base_url, 'http://h:8000/v1');
      assert.equal(rc.api_key_env, 'VLLM_KEY');
    });
  });

  it('rejects an unknown provider without writing .sddrc', async () => {
    await withTempDir((dir) => {
      const saved = process.exitCode;
      providerSetCmd({ provider: 'bogus', cwd: dir });
      assert.equal(process.exitCode, 1);
      assert.equal(fs.existsSync(path.join(dir, '.sddrc')), false);
      process.exitCode = saved;
    });
  });
});

describe('fetchModels', () => {
  const withStubbedFetch = async (impl, fn) => {
    const orig = global.fetch;
    const calls = [];
    global.fetch = async (url, opts) => { calls.push({ url, opts }); return impl(url, opts); };
    try { await fn(calls); } finally { global.fetch = orig; }
  };

  it('hits the Anthropic models endpoint with the right headers', async () => {
    await withStubbedFetch(
      () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'claude-x' }, { id: 'claude-y' }] }) }),
      async (calls) => {
        const models = await fetchModels({ providerName: 'anthropic', apiKey: 'sk-test' });
        assert.deepEqual(models, ['claude-x', 'claude-y']);
        assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models');
        assert.equal(calls[0].opts.headers['x-api-key'], 'sk-test');
        assert.equal(calls[0].opts.headers['anthropic-version'], '2023-06-01');
      },
    );
  });

  it('builds the OpenAI-compatible URL, strips a trailing slash, and omits auth when keyless', async () => {
    await withStubbedFetch(
      () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'llama3.1' }] }) }),
      async (calls) => {
        const models = await fetchModels({ providerName: 'ollama', baseURL: 'http://localhost:11434/v1/', apiKey: '' });
        assert.deepEqual(models, ['llama3.1']);
        assert.equal(calls[0].url, 'http://localhost:11434/v1/models');
        assert.equal(calls[0].opts.headers.Authorization, undefined);
      },
    );
  });

  it('sends a Bearer token when an API key is present', async () => {
    await withStubbedFetch(
      () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-4o' }] }) }),
      async (calls) => {
        await fetchModels({ providerName: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-x' });
        assert.equal(calls[0].opts.headers.Authorization, 'Bearer sk-x');
      },
    );
  });

  it('falls back to m.name when id is absent (Ollama native shape)', async () => {
    await withStubbedFetch(
      () => ({ ok: true, status: 200, json: async () => ({ data: [{ name: 'mistral' }] }) }),
      async () => {
        const models = await fetchModels({ providerName: 'ollama', baseURL: 'http://x/v1', apiKey: '' });
        assert.deepEqual(models, ['mistral']);
      },
    );
  });

  it('throws on a non-2xx response', async () => {
    await withStubbedFetch(
      () => ({ ok: false, status: 404, text: async () => 'nope' }),
      async () => {
        await assert.rejects(
          () => fetchModels({ providerName: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'k' }),
          /HTTP 404/,
        );
      },
    );
  });
});

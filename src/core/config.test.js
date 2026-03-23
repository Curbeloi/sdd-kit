import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { getConfig, resetConfig, getDefaults } from './config.js';
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

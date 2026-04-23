import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  emptyCache,
  loadCache,
  saveCache,
  cachePath,
  getFileHash,
  computeGroupHash,
  sha1,
} from './hash-cache.js';
import { withTempDir } from '../test-helpers.js';

describe('emptyCache / loadCache / saveCache', () => {
  it('emptyCache returns version 1 with empty entries', () => {
    const c = emptyCache();
    assert.equal(c.version, 1);
    assert.deepEqual(c.entries, {});
  });

  it('loadCache returns empty cache when file does not exist', async () => {
    await withTempDir((dir) => {
      const c = loadCache(dir);
      assert.equal(c.version, 1);
      assert.deepEqual(c.entries, {});
    });
  });

  it('save+load roundtrip preserves entries', async () => {
    await withTempDir((dir) => {
      const cache = emptyCache();
      cache.entries['src/foo.js'] = { mtime: 1, size: 10, sha1: 'abc' };
      saveCache(dir, cache);
      const loaded = loadCache(dir);
      assert.deepEqual(loaded.entries['src/foo.js'], { mtime: 1, size: 10, sha1: 'abc' });
    });
  });

  it('loadCache returns empty cache on corrupt JSON', async () => {
    await withTempDir((dir) => {
      const fp = cachePath(dir);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, 'not json {', 'utf-8');
      const c = loadCache(dir);
      assert.deepEqual(c.entries, {});
    });
  });

  it('loadCache discards entries on version mismatch', async () => {
    await withTempDir((dir) => {
      const fp = cachePath(dir);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, JSON.stringify({ version: 99, entries: { 'x.js': { mtime: 1, size: 1, sha1: 'x' } } }));
      const c = loadCache(dir);
      assert.equal(c.version, 1);
      assert.deepEqual(c.entries, {});
    });
  });
});

describe('getFileHash', () => {
  it('computes sha1 and caches on first call', async () => {
    await withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'a.js'), 'hello', 'utf-8');
      const cache = emptyCache();
      const h1 = getFileHash(cache, dir, 'a.js');
      assert.equal(h1, sha1(Buffer.from('hello')));
      assert.ok(cache.entries['a.js']);
      assert.equal(cache.entries['a.js'].sha1, h1);
    });
  });

  it('returns null for missing file', async () => {
    await withTempDir((dir) => {
      const cache = emptyCache();
      assert.equal(getFileHash(cache, dir, 'nope.js'), null);
    });
  });

  it('uses cache hit when mtime+size match (no file read required)', async () => {
    await withTempDir((dir) => {
      const fp = path.join(dir, 'a.js');
      fs.writeFileSync(fp, 'hello', 'utf-8');
      const stat = fs.statSync(fp);
      const cache = emptyCache();
      cache.entries['a.js'] = { mtime: stat.mtimeMs, size: stat.size, sha1: 'fakehash' };

      // Rename the file underneath so reading would fail if it happened — this
      // proves the cache hit skipped the read.
      fs.renameSync(fp, path.join(dir, 'moved.js'));

      const h = getFileHash(cache, dir, 'a.js');
      assert.equal(h, null); // stat fails because file is gone

      // Put it back and verify cache still hits when stats match
      fs.renameSync(path.join(dir, 'moved.js'), fp);
      const h2 = getFileHash(cache, dir, 'a.js');
      assert.equal(h2, 'fakehash');
    });
  });

  it('detects content change (same size, different bytes)', async () => {
    await withTempDir((dir) => {
      const fp = path.join(dir, 'a.js');
      fs.writeFileSync(fp, 'AAAAA', 'utf-8');
      const cache = emptyCache();
      const h1 = getFileHash(cache, dir, 'a.js');

      // Overwrite with same size, different content. Set mtime forward so cache invalidates.
      fs.writeFileSync(fp, 'BBBBB', 'utf-8');
      const future = new Date(Date.now() + 2000);
      fs.utimesSync(fp, future, future);

      const h2 = getFileHash(cache, dir, 'a.js');
      assert.notEqual(h1, h2);
    });
  });
});

describe('computeGroupHash', () => {
  it('is order-independent', async () => {
    await withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'a.js'), 'alpha', 'utf-8');
      fs.writeFileSync(path.join(dir, 'b.js'), 'beta', 'utf-8');
      const cache = emptyCache();
      const h1 = computeGroupHash(cache, dir, ['a.js', 'b.js']);
      const h2 = computeGroupHash(cache, dir, ['b.js', 'a.js']);
      assert.equal(h1, h2);
    });
  });

  it('changes when any file content changes', async () => {
    await withTempDir((dir) => {
      const fa = path.join(dir, 'a.js');
      fs.writeFileSync(fa, 'v1', 'utf-8');
      fs.writeFileSync(path.join(dir, 'b.js'), 'beta', 'utf-8');
      const cache = emptyCache();
      const h1 = computeGroupHash(cache, dir, ['a.js', 'b.js']);

      fs.writeFileSync(fa, 'v2', 'utf-8');
      const future = new Date(Date.now() + 2000);
      fs.utimesSync(fa, future, future);

      const h2 = computeGroupHash(cache, dir, ['a.js', 'b.js']);
      assert.notEqual(h1, h2);
    });
  });

  it('ignores missing files rather than crashing', async () => {
    await withTempDir((dir) => {
      fs.writeFileSync(path.join(dir, 'a.js'), 'alpha', 'utf-8');
      const cache = emptyCache();
      const h = computeGroupHash(cache, dir, ['a.js', 'does-not-exist.js']);
      assert.ok(typeof h === 'string' && h.length === 40);
    });
  });
});

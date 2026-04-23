/**
 * hash-cache.js — Content-hash cache for source files, keyed by mtime+size.
 *
 * On `getFileHash(cache, cwd, relPath)`:
 *   - If the cached entry's {mtime, size} match the file's stat, reuse the stored sha1 (no file read).
 *   - Otherwise read the file, compute sha1, update the entry in memory.
 *
 * `computeGroupHash` produces an order-independent hash representing a set of files —
 * used by `sdd spec refresh` to skip modules whose contents haven't changed.
 *
 * Persistence is best-effort: if the cache file is missing/corrupt we rebuild from disk.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { debugLog } from './log.js';

const CACHE_DIR = '.sdd/cache';
const CACHE_FILE = 'hashes.json';
const VERSION = 1;

export function cachePath(cwd) {
  return path.join(cwd, CACHE_DIR, CACHE_FILE);
}

export function emptyCache() {
  return { version: VERSION, entries: {} };
}

export function loadCache(cwd) {
  const fp = cachePath(cwd);
  if (!fs.existsSync(fp)) return emptyCache();
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!data || data.version !== VERSION || typeof data.entries !== 'object') {
      return emptyCache();
    }
    return data;
  } catch (err) {
    debugLog('hash-cache', `load failed: ${err.message}`);
    return emptyCache();
  }
}

export function saveCache(cwd, cache) {
  const fp = cachePath(cwd);
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    debugLog('hash-cache', `save failed: ${err.message}`);
  }
}

export function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

/**
 * Get SHA-1 of a file, using the cache when {mtime, size} match.
 * Mutates `cache.entries[relPath]` on miss. Returns null if the file cannot be stat'd or read.
 */
export function getFileHash(cache, cwd, relPath) {
  const absPath = path.join(cwd, relPath);
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return null;
  }

  const mtime = stat.mtimeMs;
  const size = stat.size;
  const entry = cache.entries[relPath];

  if (entry && entry.mtime === mtime && entry.size === size && typeof entry.sha1 === 'string') {
    return entry.sha1;
  }

  let content;
  try {
    content = fs.readFileSync(absPath);
  } catch {
    return null;
  }

  const hash = sha1(content);

  // If content didn't change, preserve mtime consistency — update the stat fields so
  // the next run is a pure cache hit. (touching a file changes mtime without changing content.)
  cache.entries[relPath] = { mtime, size, sha1: hash };
  return hash;
}

/**
 * Order-independent hash of a set of files. Null/missing files are skipped.
 */
export function computeGroupHash(cache, cwd, relPaths) {
  const parts = [];
  for (const rel of [...relPaths].sort()) {
    const h = getFileHash(cache, cwd, rel);
    if (h) parts.push(`${rel}:${h}`);
  }
  return sha1(parts.join('\n'));
}

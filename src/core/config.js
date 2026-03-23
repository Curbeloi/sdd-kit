/**
 * config.js — Centralized configuration with .sddrc support.
 *
 * Priority: CLI flags > .sddrc > env vars > defaults
 */

import fs from 'fs';
import path from 'path';
import { debugLog } from './log.js';

const DEFAULTS = {
  specs_dir: 'specs/features',
  modules_dir: 'specs/_map',
  steering_dir: '.claude/steering',
  arch_dir: 'specs/_arch',
  concurrency: 4,
  max_file_size: 50 * 1024,
  max_depth: 8,
};

let _cache = null;
let _cacheCwd = null;

/**
 * Read .sddrc from project root. Returns parsed object or empty.
 */
function readRcFile(cwd) {
  const rcPath = path.join(cwd, '.sddrc');
  if (!fs.existsSync(rcPath)) return {};

  try {
    const raw = fs.readFileSync(rcPath, 'utf-8');
    const parsed = JSON.parse(raw);
    debugLog('config', `Loaded .sddrc from ${rcPath}`);
    return parsed;
  } catch (err) {
    debugLog('config', `Failed to parse .sddrc: ${err.message}`);
    return {};
  }
}

/**
 * Get merged configuration. Lazy-loaded and cached per cwd.
 * @param {string} [cwd] - Project root directory
 * @returns {object} Configuration object with resolved values
 */
export function getConfig(cwd = process.cwd()) {
  if (_cache && _cacheCwd === cwd) return _cache;

  const rc = readRcFile(cwd);

  _cache = {
    specsDir:     rc.specs_dir     ?? DEFAULTS.specs_dir,
    modulesDir:   rc.modules_dir   ?? DEFAULTS.modules_dir,
    steeringDir:  rc.steering_dir  ?? DEFAULTS.steering_dir,
    archDir:      rc.arch_dir      ?? DEFAULTS.arch_dir,
    concurrency:  rc.concurrency   ?? DEFAULTS.concurrency,
    maxFileSize:  rc.max_file_size ?? DEFAULTS.max_file_size,
    maxDepth:     rc.max_depth     ?? DEFAULTS.max_depth,
    // Track sources for `sdd config` display
    _sources: {},
  };

  for (const key of Object.keys(DEFAULTS)) {
    _cache._sources[key] = rc[key] !== undefined ? '.sddrc' : 'default';
  }

  _cacheCwd = cwd;
  return _cache;
}

/**
 * Reset cached config (useful for testing).
 */
export function resetConfig() {
  _cache = null;
  _cacheCwd = null;
}

/**
 * Get default values (for display/reference).
 */
export function getDefaults() {
  return { ...DEFAULTS };
}

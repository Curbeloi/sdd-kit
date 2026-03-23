/**
 * test-helpers.js — Shared utilities for unit tests.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

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
 */
export function createMockSpec(dir, specName, files = {}) {
  const specDir = path.join(dir, 'specs', 'features', specName);
  fs.mkdirSync(specDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(specDir, `${name}.md`), content, 'utf-8');
  }

  return specDir;
}

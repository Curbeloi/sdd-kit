import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAffectedModuleDirs } from './git-changes.js';

describe('getAffectedModuleDirs', () => {
  it('returns "." for root-level files', () => {
    const dirs = getAffectedModuleDirs(['package.json', 'README.md']);
    assert.ok(dirs.includes('.'));
  });

  it('extracts directory for nested files', () => {
    const dirs = getAffectedModuleDirs(['src/core/scanner.js', 'src/core/log.js']);
    assert.ok(dirs.includes('src/core'));
    assert.equal(dirs.length, 1);
  });

  it('extracts multiple distinct directories', () => {
    const dirs = getAffectedModuleDirs([
      'src/core/scanner.js',
      'src/commands/init.js',
      'templates/steering/product.md',
    ]);
    assert.ok(dirs.includes('src/core'));
    assert.ok(dirs.includes('src/commands'));
    assert.ok(dirs.includes('templates/steering'));
  });

  it('handles mix of root and nested files', () => {
    const dirs = getAffectedModuleDirs(['index.js', 'src/app.js']);
    assert.ok(dirs.includes('.'));
    assert.ok(dirs.includes('src'));
  });

  it('deduplicates directories', () => {
    const dirs = getAffectedModuleDirs([
      'src/core/a.js',
      'src/core/b.js',
      'src/core/c.js',
    ]);
    assert.equal(dirs.filter(d => d === 'src/core').length, 1);
  });

  it('returns empty for empty input', () => {
    const dirs = getAffectedModuleDirs([]);
    assert.equal(dirs.length, 0);
  });
});

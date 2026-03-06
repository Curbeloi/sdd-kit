/**
 * git-changes.js — Detect changed files via git diff.
 * Used post-execute to know which modules need refreshing.
 */

import { execSync } from 'child_process';
import path from 'path';

/**
 * Take a git snapshot (short SHA or index state) before a task runs.
 * Returns a ref string to compare against later.
 */
export function snapshotBefore(cwd) {
  try {
    // If there are staged/unstaged changes, stash state won't help.
    // We use the current HEAD + working tree diff approach.
    const head = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
    return { head, timestamp: Date.now() };
  } catch {
    return null; // not a git repo
  }
}

/**
 * Get all files changed since the snapshot.
 * Includes: modified, added, renamed, deleted files.
 * Returns { files: string[], dirs: Set<string>, hasStructuralChange: boolean }
 */
export function getChangedSince(snapshot, cwd) {
  if (!snapshot) return { files: [], dirs: new Set(), hasStructuralChange: false };

  try {
    // Get changes vs the HEAD we captured (committed changes)
    let diffOutput = '';
    try {
      diffOutput = execSync(
        `git diff --name-status ${snapshot.head} HEAD`,
        { cwd, encoding: 'utf-8' }
      ).trim();
    } catch { /* no new commits */ }

    // Also get uncommitted changes (staged + unstaged)
    const uncommitted = execSync(
      'git diff --name-status HEAD',
      { cwd, encoding: 'utf-8' }
    ).trim();

    // Also get untracked files (new files not yet staged)
    const untracked = execSync(
      'git ls-files --others --exclude-standard',
      { cwd, encoding: 'utf-8' }
    ).trim();

    const allLines = [diffOutput, uncommitted].filter(Boolean).join('\n');
    const files = new Set();
    const statuses = new Map(); // file -> status (A, M, D, R)

    // Parse --name-status output: "M\tpath" or "R100\told\tnew"
    for (const line of allLines.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const status = parts[0].charAt(0); // A, M, D, R
      const filePath = parts.length >= 3 ? parts[2] : parts[1]; // renamed: use new path
      if (filePath) {
        files.add(filePath);
        statuses.set(filePath, status);
      }
      // For renames, also track old path
      if (status === 'R' && parts[1]) {
        files.add(parts[1]);
        statuses.set(parts[1], 'D');
      }
    }

    // Add untracked files
    for (const line of untracked.split('\n')) {
      if (line.trim()) {
        files.add(line.trim());
        statuses.set(line.trim(), 'A');
      }
    }

    // Extract unique top-level directories (first path segment relative to cwd)
    const dirs = new Set();
    for (const f of files) {
      const parts = f.split(path.sep);
      if (parts.length > 1) {
        // Add progressive directory levels: src, src/core, etc.
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join(path.sep));
        }
      }
    }

    // Structural change = new files/dirs added or deleted (not just modified)
    const hasStructuralChange = [...statuses.values()].some(s => s === 'A' || s === 'D' || s === 'R');

    return {
      files: [...files],
      dirs,
      hasStructuralChange,
      statuses,
    };
  } catch {
    return { files: [], dirs: new Set(), hasStructuralChange: false };
  }
}

/**
 * Get the most specific module-level directories that need refreshing.
 * Filters to directories that actually contain source files (leaf-ish dirs).
 * Maps changed files to their module spec directory names.
 */
export function getAffectedModuleDirs(changedFiles) {
  const moduleDirs = new Set();

  for (const f of changedFiles) {
    const parts = f.split(path.sep);
    if (parts.length === 1) {
      // Root-level file
      moduleDirs.add('.');
    } else {
      // Use the directory containing the file (e.g., "src/core" for "src/core/foo.js")
      moduleDirs.add(parts.slice(0, -1).join(path.sep));
    }
  }

  return [...moduleDirs];
}

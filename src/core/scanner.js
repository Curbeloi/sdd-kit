/**
 * scanner.js — Scans directories and reads source files with live progress.
 * Used by `sdd spec document` for bottom-up code analysis.
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { debugLog } from './log.js';
import { getConfig } from './config.js';

// Extensions we consider source code
const SOURCE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.php', '.java', '.go', '.rs', '.c', '.cpp', '.h',
  '.cs', '.swift', '.kt', '.scala', '.ex', '.exs', '.dart',
  '.vue', '.svelte', '.astro',
  '.sql', '.graphql', '.gql', '.prisma',
  '.json', '.yaml', '.yml', '.toml', '.env.example',
  '.md', '.txt',
  '.sh', '.bash', '.zsh',
  '.css', '.scss', '.less', '.html',
  '.dockerfile', '.tf', '.hcl',
]);

const SKIP_DIRS = new Set([
  // JS / TS
  'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache',
  'coverage', '.nyc_output',
  // Python
  '__pycache__', '.venv', 'venv', 'env', '.tox', '.pytest_cache', '.mypy_cache',
  '.eggs',
  // PHP
  'vendor',
  // Java / Kotlin
  'target', '.gradle', '.mvn', 'out',
  // Flutter / Dart
  '.dart_tool', '.fvm',
  // General
  '.git', 'specs',
]);

/**
 * Scan a directory and return the full tree.
 */
export function scanTree(rootPath) {
  const config = getConfig(rootPath);
  const dirs = [];
  const files = [];
  const skipped = [];

  if (fs.statSync(rootPath).isFile()) {
    const stat = fs.statSync(rootPath);
    return { dirs: [], files: [{ rel: path.basename(rootPath), size: stat.size }], skipped: [] };
  }

  function walk(dirPath, depth = 0) {
    if (depth > config.maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch (err) { debugLog('scanner', `Cannot read directory: ${dirPath} — ${err.message}`); return; }

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.endsWith('.egg-info')) continue;
        dirs.push(relPath);
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const basename = entry.name.toLowerCase();
        if (SOURCE_EXTS.has(ext) || basename === 'dockerfile' || basename === 'makefile') {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size <= config.maxFileSize) {
              files.push({ rel: relPath, size: stat.size });
            } else {
              skipped.push({ rel: relPath, size: stat.size, reason: 'size' });
            }
          } catch (err) { debugLog('scanner', `Cannot stat file: ${relPath} — ${err.message}`); }
        }
      }
    }
  }

  walk(rootPath);
  return { dirs, files, skipped };
}

/**
 * Group files by their top-level directory (or "." for root files).
 * Returns an array of { dir, files: [{ rel, size }] }
 */
export function groupByDirectory(tree) {
  const groups = new Map();

  for (const file of tree.files) {
    const sep = file.rel.indexOf(path.sep);
    const dir = sep === -1 ? '.' : file.rel.slice(0, sep);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }

  return Array.from(groups.entries()).map(([dir, files]) => ({ dir, files }));
}

/**
 * Print the scan plan — directories and file counts.
 */
export function printPlan(groups, totalFiles, skipped = []) {
  console.log(chalk.bold('  Plan:'));
  console.log(chalk.dim(`  ${groups.length} groups, ${totalFiles} files\n`));

  for (const g of groups) {
    const label = g.dir === '.' ? chalk.dim('root files') : chalk.blue(g.dir + '/');
    console.log(`  ${label} ${chalk.dim(`${g.files.length} files`)}`);
  }

  if (skipped.length > 0) {
    console.log(chalk.dim(`\n  ${skipped.length} file(s) skipped (exceed size limit)`));
  }
  console.log('');
}

/**
 * Read all files for a group. Returns array of { path, content }.
 */
export function readGroupFiles(rootPath, group, onFile) {
  const results = [];
  for (const file of group.files) {
    if (onFile) onFile(file.rel);
    try {
      const content = fs.readFileSync(path.join(rootPath, file.rel), 'utf-8');
      results.push({ path: file.rel, content });
    } catch (err) { debugLog('scanner', `Cannot read file: ${file.rel} — ${err.message}`); }
  }
  return results;
}

/**
 * Build prompt for analyzing a single directory group.
 */
export function buildGroupPrompt(dirName, fileContents) {
  // Budget: ~40KB total content per group, split evenly across files
  const TOTAL_BUDGET = 40000;
  const perFile = Math.max(1500, Math.floor(TOTAL_BUDGET / fileContents.length));
  const fileBlocks = fileContents.map(f =>
    `### ${f.path}\n\`\`\`\n${f.content.slice(0, perFile)}\n\`\`\``
  ).join('\n\n');

  return `Analyze this directory and write a concise spec.

## Directory: ${dirName}
## Files: ${fileContents.length}

${fileBlocks}

---

Write your analysis in this exact format (plain text, no file creation needed):

# ${dirName}

## Purpose
One paragraph: what this directory/module does.

## Key Components
- ComponentName — what it does

## Exports / Public Interface
Key functions, classes, or endpoints exposed.

## Dependencies
What it imports or depends on.

## Notes
Important patterns or decisions.
`;
}

/**
 * Build the final synthesis prompt from all partial specs.
 */
export function buildSynthesisPrompt(specName, sourcePath, partialSpecs) {
  const partials = partialSpecs.map(p =>
    `---\n## Module: ${p.dir}\n${p.content}\n`
  ).join('\n');

  return `You have analyzed each directory of ${sourcePath} individually.
Now synthesize everything into a unified spec document.

${partials}

---

Create the file specs/${specName}.spec.md with this format:

# Spec: [Title — descriptive name for the whole system/module]

## Purpose
What this codebase does as a whole.

## Architecture
How the modules fit together. Include a mermaid diagram:
\`\`\`mermaid
graph TD
  ...
\`\`\`

## Modules
For each directory, one paragraph describing its role.

## Key Interfaces
The most important public APIs across the system.

## Data Flow
How data moves through the system.

## Dependencies
External dependencies (frameworks, libraries, services).

## Notes
Important architectural decisions, patterns, or gotchas.
`;
}

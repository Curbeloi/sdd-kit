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

// ─── Symbol extraction (T3 — cheap per-file summaries for refresh prompts) ──

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.php', '.java', '.go', '.rs', '.c', '.cpp', '.h',
  '.cs', '.swift', '.kt', '.scala', '.ex', '.exs', '.dart',
  '.vue', '.svelte', '.astro',
]);

// Keywords that mark "top-level symbols" across common languages.
// A line is kept iff its first non-whitespace token matches one of these,
// it starts at column 0 (strictly top-level), and it isn't a comment.
//
// Deliberately excludes `const|let|var` at the top-level — public declarations
// are captured via their `export` prefix instead; unexported module-level vars
// are usually internals and add noise.
const SIGNATURE_FIRST_TOKENS = new Set([
  // JS / TS
  'export', 'import', 'function', 'class', 'interface', 'type', 'enum',
  'async', 'abstract', 'declare', 'namespace',
  // Python
  'def', 'from',
  // Go
  'func', 'package',
  // Rust / C-family
  'pub', 'fn', 'struct', 'trait', 'impl', 'mod', 'use',
  // Ruby / Elixir
  'module', 'defmodule', 'defstruct', 'defp',
  // Generic
  'require',
]);

const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*|#!|#(?!\[)|--|;)/;

/**
 * Extract top-level "signature-ish" lines from a source file.
 * Heuristic, regex-based, intentionally cheap. Returns up to `maxLines` trimmed lines.
 */
export function extractSymbols(content, { maxLines = 60, maxLineLength = 140 } = {}) {
  if (typeof content !== 'string' || !content) return [];
  const out = [];
  for (const raw of content.split(/\r?\n/)) {
    if (out.length >= maxLines) break;
    const line = raw;
    if (!line.trim()) continue;
    if (COMMENT_LINE_RE.test(line)) continue;

    const leading = line.match(/^\s*/)[0].length;
    if (leading > 0) continue; // top-level only

    const firstToken = line.trim().split(/[\s(<[{=]/)[0];
    if (!firstToken || !SIGNATURE_FIRST_TOKENS.has(firstToken)) continue;

    let clean = line.trim();
    // Drop trailing block-open noise — `{`, `=>`, `:` at EOL — to keep summaries compact.
    clean = clean.replace(/\s*[{][^}]*$/, '').replace(/\s*=>\s*$/, '');
    if (clean.length > maxLineLength) clean = clean.slice(0, maxLineLength - 3) + '...';
    out.push(clean);
  }
  return out;
}

/**
 * Produce a compact summary for a single file: either extracted symbols (for code)
 * or a small head-sample (for configs/docs).
 * Returns { type: 'symbols'|'head', items?: string[], text?: string }.
 */
export function extractFileSummary(filePath, content, opts = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTS.has(ext)) {
    return { type: 'symbols', items: extractSymbols(content, opts) };
  }
  return { type: 'head', text: (content || '').slice(0, opts.maxHeadBytes || 400) };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/**
 * Prompt builder that sends per-file symbol summaries instead of truncated contents.
 * ~70-80% smaller than `buildGroupPrompt` for typical source directories.
 */
export function buildGroupPromptSymbols(dirName, files) {
  const blocks = files.map(f => {
    const summary = f.summary || extractFileSummary(f.path, f.content);
    const header = `### ${f.path}  (${formatSize(f.size ?? (f.content ? f.content.length : 0))})`;
    if (summary.type === 'symbols') {
      if (summary.items.length === 0) {
        return `${header}\n_no top-level symbols detected_`;
      }
      return `${header}\n${summary.items.map(s => '- ' + s).join('\n')}`;
    }
    return `${header}\n\`\`\`\n${summary.text}\n\`\`\``;
  }).join('\n\n');

  return `Analyze this directory and write a concise spec based on the file summaries below.
File contents are summarized as top-level symbols (functions, classes, exports, imports) — not full source.
Infer purpose and relationships from the symbol names and paths; do not request the full source.

## Directory: ${dirName}
## Files: ${files.length}

${blocks}

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

// Shared output shape for both spec-producing prompts below. Kept in one place
// so the `--prompt-only` prompt can never drift from what the real run asks for.
const SPEC_FORMAT = `# Spec: [Title — descriptive name for the whole system/module]

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
Important architectural decisions, patterns, or gotchas.`;

/**
 * Build the final synthesis prompt from all partial specs.
 *
 * Only valid when `partialSpecs` really are per-directory analyses — the opening
 * line asserts they exist. Callers with nothing but a file list must use
 * `buildDirectSpecPrompt` instead; telling a model it already analyzed code it
 * was never shown is how a spec gets written from filenames alone.
 */
export function buildSynthesisPrompt(specName, sourcePath, partialSpecs) {
  const partials = partialSpecs.map(p =>
    `---\n## Module: ${p.dir}\n${p.content}\n`
  ).join('\n');

  return `You have analyzed each directory of ${sourcePath} individually.
Now synthesize everything into a unified spec document.

${partials}

---

Write a unified spec for \`${specName}\` in this format:

${SPEC_FORMAT}
`;
}

/**
 * Build a self-contained prompt for the `--prompt-only` path, where no analysis
 * pass has run. The prompt carries file *paths*, not contents, so it must tell
 * the agent to read them — it is meant to be pasted into an agent that has file
 * access, and that read step is the only thing standing between it and a spec
 * invented from filenames.
 */
export function buildDirectSpecPrompt(specName, sourcePath, filePaths) {
  const fileList = filePaths.map(p => `- \`${p}\``).join('\n');

  return `Reverse engineer ${sourcePath} into a unified spec.

No analysis has been done yet. Read all ${filePaths.length} files listed below
before writing anything — this prompt carries their paths, not their contents.
Do not infer behaviour from a filename you have not opened.

## Files (relative to ${sourcePath})
${fileList}

---

Write a unified spec for \`${specName}\` in this format:

${SPEC_FORMAT}
`;
}

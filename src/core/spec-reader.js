/**
 * spec-reader.js
 * Read and parse specs from disk. Pure functions, no side effects.
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';

// Name-prefix → spec-type subdirectory (siblings under the specs root).
// `feat-*` maps to `features`, preserving the original single-folder layout.
export const SPEC_TYPE_DIRS = {
  feat: 'features', feature: 'features',
  fix: 'bugfix', bug: 'bugfix', bugfix: 'bugfix',
  hotfix: 'hotfix',
  chore: 'chore',
  refactor: 'refactor',
  docs: 'docs', doc: 'docs',
  perf: 'perf',
  test: 'test',
};

const RESERVED_SPEC_DIRS = new Set(['_map', '_arch', 'archived']);
const SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'];

/**
 * Absolute paths of the spec-type directories that currently exist under the
 * specs root (the parent of `specsDir`, e.g. `specs/` for `specs/features`).
 * Reserved dirs (`_map`, `_arch`, `archived`, any `_*`) are skipped. Falls back
 * to a single directory (old behavior) when `specsDir` has no parent.
 * @param {string} cwd
 * @returns {string[]}
 */
export function specTypeDirs(cwd) {
  const { specsDir } = getConfig(cwd);
  const root = path.dirname(specsDir);
  if (!root || root === '.') return [path.join(cwd, specsDir)];

  const rootAbs = path.join(cwd, root);
  if (!fs.existsSync(rootAbs)) return [path.join(cwd, specsDir)];

  return fs.readdirSync(rootAbs, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_') && !RESERVED_SPEC_DIRS.has(d.name))
    .map(d => path.join(rootAbs, d.name));
}

/**
 * Destination directory for a NEW spec, routed by its name prefix. `feat-*`
 * (and unknown prefixes) resolve to the unchanged `specsDir`; `fix-`/`bug-` →
 * `bugfix/`, `chore-` → `chore/`, etc.
 * @param {string} cwd
 * @param {string} specName
 * @returns {string} absolute path
 */
export function specDestDir(cwd, specName) {
  const { specsDir } = getConfig(cwd);
  const root = path.dirname(specsDir);
  const prefix = String(specName).split('-')[0].toLowerCase();
  const sub = SPEC_TYPE_DIRS[prefix];
  if (!root || root === '.' || !sub) return path.join(cwd, specsDir, specName);
  return path.join(cwd, root, sub, specName);
}

/**
 * Find an existing spec directory by name across all type dirs.
 * @param {string} cwd
 * @param {string} specName
 * @returns {string|null} absolute path, or null if not found
 */
export function resolveSpecDir(cwd, specName) {
  for (const typeDir of specTypeDirs(cwd)) {
    const candidate = path.join(typeDir, specName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function readAllSpecs(cwd) {
  const specs = [];
  const seen = new Set();
  for (const typeDir of specTypeDirs(cwd)) {
    if (!fs.existsSync(typeDir)) continue;
    for (const d of fs.readdirSync(typeDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = path.join(typeDir, d.name);
      // A directory counts as a spec only if it holds at least one spec file.
      if (!SPEC_FILES.some(f => fs.existsSync(path.join(dir, f)))) continue;
      if (seen.has(d.name)) continue; // first type dir wins on a name collision
      seen.add(d.name);
      specs.push(readSpecAt(d.name, dir));
    }
  }
  return specs;
}

export function readSpec(cwd, specName) {
  const dir = resolveSpecDir(cwd, specName);
  if (!dir) return null;
  return readSpecAt(specName, dir);
}

/**
 * Read a spec from a known absolute directory.
 * Shape: { name, dir, files, tasks, tasksContent, mtime }.
 *
 * `mtime` is the newest mtime across the spec's files (epoch ms, 0 if unknown).
 * Callers that have to drop specs to fit a budget — `sdd arch` — use it to keep
 * the most recently touched work.
 */
function readSpecAt(specName, dir) {
  const files = {};
  let mtime = 0;

  const stamp = (fp) => {
    try { mtime = Math.max(mtime, fs.statSync(fp).mtimeMs); } catch { /* unreadable — leave as-is */ }
  };

  for (const f of ['requirements.md', 'design.md']) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, 'utf-8');
      if (content.trim()) files[f.replace('.md', '')] = content;
      stamp(fp);
    }
  }

  const tasksPath = path.join(dir, 'tasks.md');
  const hasTasks = fs.existsSync(tasksPath);
  const tasksContent = hasTasks ? fs.readFileSync(tasksPath, 'utf-8') : '';
  if (hasTasks) stamp(tasksPath);
  const tasks = parseTasks(tasksContent);

  return { name: specName, dir, files, tasks, tasksContent, mtime };
}

/**
 * Read all module specs from specs/_map/*.spec.md
 * Returns { moduleName: content } map.
 */
export function readModuleSpecs(cwd) {
  const dir = path.join(cwd, getConfig(cwd).modulesDir);
  if (!fs.existsSync(dir)) return {};

  const result = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.spec.md'))) {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (content.trim()) {
      const name = f.replace('.spec.md', '');
      result[name] = content;
    }
  }
  return result;
}

export function readSteering(cwd) {
  const dir = path.join(cwd, getConfig(cwd).steeringDir);
  if (!fs.existsSync(dir)) return {};

  const result = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (content.trim()) result[f.replace('.md', '')] = content;
  }
  return result;
}

export function parseTasks(content) {
  if (!content) return [];
  const tasks = [];
  // Regex allows backtick-quoted terms inside descriptions.
  // The LAST backtick-quoted value is captured as the file reference.
  // Supports multi-level IDs (1.2.3) and any path format in backticks.
  const re = /^- \[([ xX])\]\s+\*\*(\d+(?:\.\d+)*)\*\*\s+(.+?)(?:\s+`([^`]+)`)?\s*(?:(?:<-|←).*)?$/gm;
  let m;
  while ((m = re.exec(content))) {
    tasks.push({
      done: m[1].toLowerCase() === 'x',
      id: m[2],
      desc: m[3].trim(),
      file: m[4] || null,
    });
  }
  return tasks;
}

export function findNextPendingTask(tasks) {
  return tasks.find(t => !t.done) || null;
}

// ─── Frontmatter (minimal, string-only YAML-ish) ─────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse a leading `---\n...\n---` block as flat key:value pairs.
 * Values are treated as plain strings; surrounding quotes (single or double)
 * are stripped. Not a full YAML parser — only intended for metadata we write
 * ourselves (e.g. `source_hash`, `generated_at`).
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string') return { frontmatter: null, body: '' };
  const m = content.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: null, body: content };

  const fm = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) fm[key] = value;
  }

  return { frontmatter: fm, body: content.slice(m[0].length) };
}

/**
 * Serialize a frontmatter object + body back into a single string.
 * Null/empty frontmatter returns the body unchanged.
 */
export function stringifyFrontmatter(frontmatter, body) {
  if (!frontmatter || typeof frontmatter !== 'object' || Object.keys(frontmatter).length === 0) {
    return body;
  }
  const lines = [];
  for (const [k, v] of Object.entries(frontmatter)) {
    lines.push(`${k}: ${v}`);
  }
  const prefix = `---\n${lines.join('\n')}\n---\n`;
  return prefix + body;
}

/**
 * spec-reader.js
 * Read and parse specs from disk. Pure functions, no side effects.
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';

export function readAllSpecs(cwd) {
  const specsPath = path.join(cwd, getConfig(cwd).specsDir);
  if (!fs.existsSync(specsPath)) return [];

  return fs.readdirSync(specsPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => readSpec(cwd, d.name))
    .filter(Boolean);
}

export function readSpec(cwd, specName) {
  const dir = path.join(cwd, getConfig(cwd).specsDir, specName);
  if (!fs.existsSync(dir)) return null;

  const files = {};
  for (const f of ['requirements.md', 'design.md']) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, 'utf-8');
      if (content.trim()) files[f.replace('.md', '')] = content;
    }
  }

  const tasksPath = path.join(dir, 'tasks.md');
  const tasksContent = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, 'utf-8') : '';
  const tasks = parseTasks(tasksContent);

  return { name: specName, dir, files, tasks, tasksContent };
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

/**
 * sdd spec create — scaffold spec files (empty with header)
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

const LEVEL_FILES = {
  1: ['tasks.md'],
  2: ['requirements.md', 'tasks.md'],
  3: ['requirements.md', 'design.md', 'tasks.md'],
};

const FILE_TITLES = {
  'requirements.md': 'Requirements',
  'design.md': 'Design',
  'tasks.md': 'Tasks',
};

function getGitAuthor() {
  try {
    const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
    const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
    if (name && email) return `${name} <${email}>`;
    if (name) return name;
    return null;
  } catch {
    return null;
  }
}

function buildHeader(fileName, specName, { description, author, date }) {
  const title = FILE_TITLES[fileName] || 'Spec';
  const lines = [`# ${title}: ${specName}`, ''];

  const meta = [];
  meta.push(`Created: ${date}`);
  if (author) meta.push(`Author: ${author}`);
  if (meta.length) lines.push(`> ${meta.join(' | ')}`);
  if (description) lines.push(`> Feature: ${description}`);

  lines.push('', '<!-- Fill this spec with your AI assistant -->', '');
  return lines.join('\n');
}

export async function createCmd({ description, name, level = 2, cwd = process.cwd() }) {
  if (!description && !name) {
    console.error(chalk.red('\n  Provide a description or --name to create a spec.\n'));
    console.log(chalk.dim('  sdd spec create "JWT authentication"'));
    console.log(chalk.dim('  sdd spec create --name feat-jwt-auth\n'));
    process.exit(1);
  }

  const specName = name || slugify(description);

  if (!specName || specName === 'feat-') {
    console.error(chalk.red('\n  Could not generate a valid spec name from the description.'));
    console.log(chalk.dim('  Use --name to provide a name explicitly.\n'));
    process.exit(1);
  }

  const specDir = path.join(cwd, 'specs', 'features', specName);

  if (fs.existsSync(specDir)) {
    const existing = fs.readdirSync(specDir).filter(f => f.endsWith('.md'));
    if (existing.length > 0) {
      console.error(chalk.yellow(`\n  Spec "${specName}" already exists with: ${existing.join(', ')}`));
      console.log(chalk.dim('  Use a different --name or delete the existing spec.\n'));
      process.exit(1);
    }
  }

  const files = LEVEL_FILES[level] || LEVEL_FILES[2];

  const levelLabel = { 1: chalk.red('-1 tasks'), 2: chalk.yellow('-2 req+tasks'), 3: chalk.green('-3 full') }[level];
  console.log(`\n${chalk.bold('sdd spec create')} — ${chalk.cyan(specName)} (${levelLabel})\n`);

  fs.mkdirSync(specDir, { recursive: true });

  const author = getGitAuthor();
  const date = new Date().toISOString().slice(0, 10);

  for (const file of files) {
    const content = buildHeader(file, specName, { description, author, date });
    fs.writeFileSync(path.join(specDir, file), content, 'utf-8');
    console.log(`  ${chalk.green('created')} specs/features/${specName}/${file}`);
  }

  console.log('');
}

function slugify(s) {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug.startsWith('feat-') ? slug : `feat-${slug}`;
}

/**
 * sdd init — scaffold SDD structure in a project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { readModuleSpecs, readAllSpecs } from '../core/spec-reader.js';
import { askClaude, batchAsk, detectEngine, getEngineName } from '../core/claude-api.js';
import { debugLog, warnLog } from '../core/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates/steering');

export async function initCmd({ auto = false, cwd = process.cwd() } = {}) {
  console.log(`\n${chalk.bold('sdd init')} — Setting up SDD in this project\n`);

  const steeringDir = path.join(cwd, '.claude', 'steering');
  const specsDir = path.join(cwd, 'specs', 'features');

  fs.mkdirSync(steeringDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });

  if (auto) {
    await autoGenerate(steeringDir, cwd);
  } else {
    scaffoldTemplates(steeringDir);
  }

  // Ensure CLAUDE.md references the SDD documentation
  ensureClaudeMd(cwd);

  // Add .sdd/ to .gitignore so the hash cache doesn't get committed
  ensureGitignore(cwd);

  console.log('');
}

function ensureGitignore(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const already = content.split(/\r?\n/).some(line => {
    const s = line.trim();
    return s === '.sdd/' || s === '.sdd' || s === '.sdd/*';
  });
  if (already) return;

  fs.writeFileSync(
    gitignorePath,
    content.trimEnd() + '\n\n# sdd-kit cache\n.sdd/\n',
    'utf-8',
  );
  console.log(chalk.dim('  updated  .gitignore (added .sdd/)'));
}

function scaffoldTemplates(steeringDir) {
  let created = 0;
  for (const file of ['product.md', 'tech.md', 'structure.md']) {
    const dest = path.join(steeringDir, file);
    if (fs.existsSync(dest)) {
      console.log(chalk.dim(`  skip  ${file} (already exists)`));
      continue;
    }
    const templatePath = path.join(TEMPLATES_DIR, file);
    if (!fs.existsSync(templatePath)) {
      console.log(chalk.yellow(`  warn  template not found: ${file}`));
      continue;
    }
    const template = fs.readFileSync(templatePath, 'utf-8');
    fs.writeFileSync(dest, template, 'utf-8');
    console.log(chalk.green(`  created  .claude/steering/${file}`));
    created++;
  }

  if (created > 0) {
    console.log(`\n${chalk.bold('Next steps:')}`);
    console.log(chalk.cyan('  1. Edit .claude/steering/*.md with your project info'));
    console.log(chalk.cyan('  2. Run: sdd spec create "your first feature"'));
  } else {
    console.log(chalk.dim('  All steering files already exist. Ready to go.'));
  }
}

async function autoGenerate(steeringDir, cwd) {
  const moduleSpecs = readModuleSpecs(cwd);
  const moduleCount = Object.keys(moduleSpecs).length;

  if (!moduleCount) {
    console.log(chalk.yellow('  No module specs found. Run `sdd spec document <path>` first.'));
    console.log(chalk.dim('  Then re-run: sdd init --auto\n'));
    return;
  }

  console.log(chalk.dim(`  Engine: ${getEngineName()}`));
  console.log(chalk.dim(`  Using ${moduleCount} module spec(s) to generate steering docs\n`));

  // Build context from module specs
  const moduleContext = Object.entries(moduleSpecs)
    .map(([name, content]) => `### ${name}\n${content.slice(0, 2000)}`)
    .join('\n\n');

  const files = [
    {
      name: 'product.md',
      prompt: `Based on these module specs from an existing codebase, write a Product Context document.

${moduleContext}

Write a concise product.md with these sections:
# Product Context
## What is this project?
[One paragraph based on what the code does]
## Who are the users?
[Infer from the code — developers, end users, admins, etc.]
## Key goals
- [3-5 goals based on what the code implements]

Return ONLY the markdown content.`,
    },
    {
      name: 'tech.md',
      prompt: `Based on these module specs from an existing codebase, write a Tech Stack document.

${moduleContext}

Write a concise tech.md with these sections:
# Tech Stack
## Languages & Frameworks
- [List actual languages, frameworks, libraries found in the code]
## Infrastructure
- [List databases, services, APIs, deployment tools found]
## Key constraints
- [List any constraints evident from the code — Node version, ESM, etc.]

Return ONLY the markdown content.`,
    },
    {
      name: 'structure.md',
      prompt: `Based on these module specs from an existing codebase, write a Project Structure document.

${moduleContext}

Write a concise structure.md with these sections:
# Project Structure
## Directory layout
[Describe the main directories and what they contain, based on the module names]
## Conventions
- [List patterns found: naming, file organization, import style, etc.]

Return ONLY the markdown content.`,
    },
  ];

  // Run all 3 steering generations in parallel (via batchAsk).
  const items = files.map(f => ({ prompt: f.prompt, label: f.name }));
  const spinners = new Map();
  for (let i = 0; i < items.length; i++) {
    spinners.set(i, ora(`  Generating ${items[i].label}...`).start());
  }

  await batchAsk(items, {
    maxTokens: 1500,
    cwd,
    onItemDone: (label, content, i, err) => {
      const spinner = spinners.get(i);
      if (err) {
        spinner.fail(`  ${chalk.red('failed')}  ${label}: ${err.message}`);
        return;
      }
      fs.writeFileSync(path.join(steeringDir, label), content, 'utf-8');
      spinner.succeed(`  ${chalk.green('created')}  .claude/steering/${label}`);
    },
  });

  console.log(`\n${chalk.dim('  Review and edit .claude/steering/*.md as needed.')}`);
}

// ─── CLAUDE.md integration ───────────────────────────────────────────────

const SDD_SECTION_MARKER = '<!-- sdd-kit:start -->';
const SDD_SECTION_END = '<!-- sdd-kit:end -->';

const SDD_BLOCK = `${SDD_SECTION_MARKER}
## SDD (Spec-Driven Development)

This project uses [sdd-kit](https://github.com/Curbeloi/sdd-kit). Specs drive code.

### Documentation
- \`.claude/steering/\` — project context (product, tech, structure)
- \`specs/features/\` — feature specs (requirements, design, tasks)
- \`specs/_map/\` — auto-generated module map (skipped when source is unchanged)
- \`specs/_arch/\` — architecture views

### Most-used commands
- \`sdd spec create "feature"\` — scaffold spec (default req + tasks; \`-3\` adds design)
- \`sdd spec execute <name>\` — run next task via Claude Code
- \`sdd spec status\` — progress overview
- \`sdd spec refresh\` — update module map (skips unchanged; \`-f\` force, \`-d\` deep)
- \`sdd arch\` — regenerate architecture views
- \`sdd --help\` — full reference

### Conventions
- Read relevant specs in \`specs/features/\` before implementing.
- Check \`.claude/steering/\` for project context.
- Completed tasks are auto-marked in \`tasks.md\`.
${SDD_SECTION_END}`;

function ensureClaudeMd(cwd) {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(SDD_SECTION_MARKER)) {
      // Already has SDD section — update it
      const regex = new RegExp(`${SDD_SECTION_MARKER}[\\s\\S]*?${SDD_SECTION_END}`);
      const updated = content.replace(regex, SDD_BLOCK);
      fs.writeFileSync(claudeMdPath, updated, 'utf-8');
      console.log(chalk.dim('  updated  CLAUDE.md (SDD section)'));
    } else {
      // Append SDD section
      fs.writeFileSync(claudeMdPath, content.trimEnd() + '\n\n' + SDD_BLOCK + '\n', 'utf-8');
      console.log(chalk.green('  updated  CLAUDE.md (added SDD section)'));
    }
  } else {
    // Create CLAUDE.md with SDD section
    fs.writeFileSync(claudeMdPath, '# CLAUDE.md\n\n' + SDD_BLOCK + '\n', 'utf-8');
    console.log(chalk.green('  created  CLAUDE.md'));
  }
}

/**
 * Refresh steering docs from current module specs + feature specs.
 * Only runs if .claude/steering/ already exists (user opted in via `sdd init`).
 * Single Claude call → updates all 3 files.
 */
export async function refreshSteering({ cwd = process.cwd(), silent = false, structuralChange = false } = {}) {
  const steeringDir = path.join(cwd, '.claude', 'steering');
  if (!fs.existsSync(steeringDir)) return; // user hasn't initialized steering

  const moduleSpecs = readModuleSpecs(cwd);
  const featureSpecs = readAllSpecs(cwd);
  if (!Object.keys(moduleSpecs).length && !featureSpecs.length) return;

  const moduleContext = Object.entries(moduleSpecs)
    .map(([name, content]) => `### Module: ${name}\n${content.slice(0, 1500)}`)
    .join('\n\n');

  const featureContext = featureSpecs.map(spec => {
    const done = spec.tasks.filter(t => t.done).length;
    return `- **${spec.name}**: ${done}/${spec.tasks.length} tasks`;
  }).join('\n');

  // Read current steering to preserve user edits as much as possible
  const currentSteering = {};
  for (const f of ['product.md', 'tech.md', 'structure.md']) {
    const fp = path.join(steeringDir, f);
    if (fs.existsSync(fp)) currentSteering[f] = fs.readFileSync(fp, 'utf-8');
  }

  // When structure changed (new files/dirs added or deleted), emphasize structure.md update
  const structuralHint = structuralChange
    ? `\n\nIMPORTANT: The project structure has changed (files/directories were added or removed).
Pay special attention to structure.md — update the directory layout and any new conventions.
Reflect new modules, moved files, or deleted directories accurately.`
    : '';

  // Determine which files to update: all 3 on structural change, only product+tech otherwise
  const filesToUpdate = structuralChange
    ? ['product.md', 'tech.md', 'structure.md']
    : ['product.md', 'tech.md', 'structure.md'];

  const prompt = `Update these project steering documents based on the current codebase analysis.

## Current Module Specs
${moduleContext}

${featureContext ? `## Feature Specs\n${featureContext}` : ''}

## Current Steering Documents
${Object.entries(currentSteering).map(([name, content]) => `### ${name}\n${content}`).join('\n\n')}

Update the 3 steering documents to reflect the current state of the project.
Keep any user-written context that is still accurate. Add new information from module specs.
Remove outdated information.${structuralHint}

Return the 3 files separated by exactly this marker: ---FILE_SEPARATOR---
Order: product.md, tech.md, structure.md
Return ONLY the markdown content for each file, no explanations.`;

  try {
    const result = await askClaude(prompt, { maxTokens: 3000, cwd });
    const parts = result.split('---FILE_SEPARATOR---').map(p => p.trim());

    if (parts.length >= 3) {
      const names = ['product.md', 'tech.md', 'structure.md'];
      for (let i = 0; i < 3; i++) {
        if (parts[i] && parts[i].length > 50) {
          fs.writeFileSync(path.join(steeringDir, names[i]), parts[i], 'utf-8');
        }
      }
      if (!silent) {
        const extra = structuralChange ? ' (structural changes detected)' : '';
        console.log(chalk.dim(`  Steering docs updated (.claude/steering/)${extra}`));
      }
    }
  } catch (err) {
    debugLog('steering', `Refresh failed: ${err.message}`);
    if (!silent) warnLog(`Steering docs not updated: ${err.message}`);
  }
}

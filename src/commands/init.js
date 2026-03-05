/**
 * sdd init — scaffold SDD structure in a project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { readModuleSpecs, readAllSpecs } from '../core/spec-reader.js';
import { askClaude, detectEngine, getEngineName } from '../core/claude-api.js';

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

  console.log('');
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

  for (const file of files) {
    const dest = path.join(steeringDir, file.name);
    const spinner = ora(`  Generating ${file.name}...`).start();

    try {
      const content = await askClaude(file.prompt, { maxTokens: 1500, cwd });
      fs.writeFileSync(dest, content, 'utf-8');
      spinner.succeed(`  ${chalk.green('created')}  .claude/steering/${file.name}`);
    } catch (err) {
      spinner.fail(`  ${chalk.red('failed')}  ${file.name}: ${err.message}`);
    }
  }

  console.log(`\n${chalk.dim('  Review and edit .claude/steering/*.md as needed.')}`);
}

// ─── CLAUDE.md integration ───────────────────────────────────────────────

const SDD_SECTION_MARKER = '<!-- sdd-kit:start -->';
const SDD_SECTION_END = '<!-- sdd-kit:end -->';

const SDD_BLOCK = `${SDD_SECTION_MARKER}
## SDD (Spec-Driven Development)

This project uses [sdd-kit](https://github.com/anthropics/sdd-kit) for spec-driven development.

### Documentation structure
- \`.claude/steering/\` — Project context (product, tech stack, structure)
- \`specs/features/\` — Feature specs (requirements, design, tasks)
- \`specs/_modules/\` — Living module documentation (auto-generated)
- \`specs/_arch/\` — Architecture views and dashboard

### Key commands
- \`sdd spec create "feature"\` — Create a new feature spec
- \`sdd spec execute <name>\` — Execute next task from a spec
- \`sdd spec status\` — Show project progress
- \`sdd arch\` — Generate architecture dashboard

### When working on this project
- Read relevant specs in \`specs/features/\` before implementing features
- Check \`.claude/steering/\` for project context and conventions
- After completing tasks, they are auto-marked in \`tasks.md\`
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
export async function refreshSteering({ cwd = process.cwd(), silent = false } = {}) {
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

  const prompt = `Update these project steering documents based on the current codebase analysis.

## Current Module Specs
${moduleContext}

${featureContext ? `## Feature Specs\n${featureContext}` : ''}

## Current Steering Documents
${Object.entries(currentSteering).map(([name, content]) => `### ${name}\n${content}`).join('\n\n')}

Update the 3 steering documents to reflect the current state of the project.
Keep any user-written context that is still accurate. Add new information from module specs.
Remove outdated information.

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
      if (!silent) console.log(chalk.dim('  Steering docs updated (.claude/steering/)'));
    }
  } catch {
    // Non-critical — don't block the main operation
  }
}

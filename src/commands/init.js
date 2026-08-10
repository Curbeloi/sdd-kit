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
import { cliAvailable } from '../core/cli-detect.js';
import { getConfig, getDefaults, writeRc } from '../core/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates/steering');

export async function initCmd({ auto = false, cwd = process.cwd(), detect } = {}) {
  console.log(`\n${chalk.bold('sdd init')} — Setting up SDD in this project\n`);

  // Detect the agentic CLIs once; file placement keys off it.
  const env = detect || {
    claude: await cliAvailable('claude'),
    opencode: await cliAvailable('opencode'),
  };

  // Resolve where steering + skill live. `.claude/` is used only when Claude Code
  // is installed; otherwise everything goes under a root `sdd/` folder. A user-set
  // steering_dir in .sddrc always wins; a non-default choice is persisted so later
  // refresh/read operations use the same location.
  const layout = sddLayout(env);
  const config = getConfig(cwd);
  let steeringRel;
  if (config._sources.steering_dir === '.sddrc') {
    steeringRel = config.steeringDir;
  } else {
    steeringRel = layout.steeringDir;
    if (steeringRel !== getDefaults().steering_dir) writeRc(cwd, { steering_dir: steeringRel });
  }

  const steeringDir = path.join(cwd, steeringRel);
  const specsDir = path.join(cwd, 'specs', 'features');

  fs.mkdirSync(steeringDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });

  if (auto) {
    await autoGenerate(steeringDir, cwd, steeringRel);
  } else {
    scaffoldTemplates(steeringDir, steeringRel);
  }

  // CLAUDE.md — universal instruction file (Claude Code's primary, opencode's fallback).
  ensureClaudeMd(cwd);

  // AGENTS.md — opencode's primary instruction file. Create it when opencode is
  // detected so the SDD block lives where opencode actually reads it; always keep
  // an existing one in sync.
  ensureAgentsMd(cwd, env);

  // SDD skill file — under .claude/skills/ with Claude Code, else sdd/SKILL.md.
  await ensureSkillFile(cwd, env);

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

function scaffoldTemplates(steeringDir, label = '.claude/steering') {
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
    console.log(chalk.green(`  created  ${label}/${file}`));
    created++;
  }

  if (created > 0) {
    console.log(`\n${chalk.bold('Next steps:')}`);
    console.log(chalk.cyan(`  1. Edit ${label}/*.md with your project info`));
    console.log(chalk.cyan('  2. Run: sdd spec create "your first feature"'));
  } else {
    console.log(chalk.dim('  All steering files already exist. Ready to go.'));
  }
}

async function autoGenerate(steeringDir, cwd, dirLabel = '.claude/steering') {
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
      spinner.succeed(`  ${chalk.green('created')}  ${dirLabel}/${label}`);
    },
  });

  console.log(`\n${chalk.dim(`  Review and edit ${dirLabel}/*.md as needed.`)}`);
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

/**
 * Insert or update the SDD block in an instruction file.
 * @param {string} filePath
 * @param {string} label - display name for log lines
 * @param {object} opts
 * @param {boolean} opts.create - create the file (with `heading`) when missing
 * @param {string} opts.heading - H1 used when creating the file
 */
function upsertSddBlock(filePath, label, { create, heading }) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes(SDD_SECTION_MARKER)) {
      const regex = new RegExp(`${SDD_SECTION_MARKER}[\\s\\S]*?${SDD_SECTION_END}`);
      fs.writeFileSync(filePath, content.replace(regex, SDD_BLOCK), 'utf-8');
      console.log(chalk.dim(`  updated  ${label} (SDD section)`));
    } else {
      fs.writeFileSync(filePath, content.trimEnd() + '\n\n' + SDD_BLOCK + '\n', 'utf-8');
      console.log(chalk.green(`  updated  ${label} (added SDD section)`));
    }
  } else if (create) {
    fs.writeFileSync(filePath, `${heading}\n\n` + SDD_BLOCK + '\n', 'utf-8');
    console.log(chalk.green(`  created  ${label}`));
  }
}

function ensureClaudeMd(cwd) {
  // CLAUDE.md is the Claude Code entry point; opencode reads it as a fallback
  // when no AGENTS.md exists. Always ensure it.
  upsertSddBlock(path.join(cwd, 'CLAUDE.md'), 'CLAUDE.md', { create: true, heading: '# CLAUDE.md' });
}

function ensureAgentsMd(cwd, { opencode = false } = {}) {
  // AGENTS.md is opencode's primary instruction file (it ignores CLAUDE.md when
  // AGENTS.md exists). Create it when opencode is detected so the SDD block lives
  // in the file opencode actually reads; always keep an existing one in sync.
  const exists = fs.existsSync(path.join(cwd, 'AGENTS.md'));
  upsertSddBlock(path.join(cwd, 'AGENTS.md'), 'AGENTS.md', { create: opencode || exists, heading: '# AGENTS.md' });
}

// ─── SDD file layout (.claude/ vs sdd/) ─────────────────────────────────────

// `.claude/` is used only when Claude Code is installed. Otherwise everything
// lives under a single root `sdd/` folder. Claude Code requires the uppercase
// `SKILL.md` filename under `.claude/skills/<name>/`.
export const CLAUDE_STEERING_DIR = '.claude/steering';
export const SDD_STEERING_DIR = 'sdd/steering';
export const CLAUDE_SKILL_PATH = '.claude/skills/sdd/SKILL.md';
export const SDD_SKILL_PATH = 'sdd/SKILL.md';

/**
 * Resolve where steering docs and the skill file live, given CLI detection.
 * Claude Code present → `.claude/`; otherwise a root `sdd/` folder.
 * @param {{claude?: boolean}} detected
 * @returns {{steeringDir: string, skillFile: string}}
 */
export function sddLayout({ claude } = {}) {
  return claude
    ? { steeringDir: CLAUDE_STEERING_DIR, skillFile: CLAUDE_SKILL_PATH }
    : { steeringDir: SDD_STEERING_DIR, skillFile: SDD_SKILL_PATH };
}

const SDD_SKILL_CONTENT = `---
name: sdd
description: Spec-Driven Development with sdd-kit. Use when planning a feature, fixing a bug, or implementing any change — a spec in specs/ must exist before code.
---

# sdd-kit — Spec-Driven Development

The spec is the source of truth; code is its expression. **Never plan or write code
without a spec.** If none exists for the task, create one first at the right size.

## Workflow

\`\`\`bash
# 1. New work — pick the size:
sdd spec create "clear description" -1   # bug fix / tweak  → tasks.md
sdd spec create "clear description"      # feature (default) → requirements + tasks
sdd spec create "clear description" -3   # complex / new arch → + design.md

# 2. Review the generated spec with the user before executing.

# 3. Execute tasks:
sdd spec execute <spec-name>             # next pending task
sdd spec execute <spec-name> --task 1.2  # specific task
sdd spec execute <spec-name> --dry-run   # preview only

# 4. Keep docs alive after structural changes:
sdd spec refresh                         # update the module map
sdd arch                                 # rebuild architecture views
\`\`\`

## Spec sizes

| Flag | Files | When |
|------|-------|------|
| \`-1\` | tasks.md | bug fix, tweak, small refactor |
| \`-2\` (default) | requirements.md + tasks.md | clear feature (1–3 days) |
| \`-3\` | requirements.md + design.md + tasks.md | complex feature, new architecture |

## Spec name & type

The "type" is the prefix you pass to \`--name\` (free-form): \`feat-\`, \`fix-\`, \`bug-\`,
\`chore-\`, \`refactor-\`, \`docs-\`, \`perf-\`. Without \`--name\`, the name is auto-derived
and prefixed \`feat-\`.

## Structure

- steering docs (\`.claude/steering/\` or \`sdd/steering/\`) — project context (product, tech, structure)
- \`specs/features/\` (and sibling type folders) — feature specs
- \`specs/_map/\` — auto-generated module map
- \`specs/_arch/\` — architecture views

## Rules

1. No spec, no code — create the spec first, at the right size.
2. Show the spec to the user before \`sdd spec execute\`.
3. A bug fix doesn't need \`design.md\`; a new architecture does.
4. Read relevant specs in \`specs/\` before implementing.
5. The spec wins — if chat and spec conflict, update the spec first.
6. Completed tasks are auto-marked in \`tasks.md\`.

Reference: https://github.com/Curbeloi/sdd-kit
`;

/**
 * Create the SDD skill file where the active agentic CLI (claude / opencode) will
 * discover it. Idempotent — existing files are skipped, never overwritten.
 */
export async function ensureSkillFile(cwd, detected) {
  const env = detected || {
    claude: await cliAvailable('claude'),
    opencode: await cliAvailable('opencode'),
  };
  const rel = sddLayout(env).skillFile;
  const fp = path.join(cwd, rel);

  if (fs.existsSync(fp)) {
    console.log(chalk.dim(`  skip  ${rel} (already exists)`));
    return;
  }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, SDD_SKILL_CONTENT, 'utf-8');
  console.log(chalk.green(`  created  ${rel}`));
}

/**
 * Refresh steering docs from current module specs + feature specs.
 * Only runs if .claude/steering/ already exists (user opted in via `sdd init`).
 * Single Claude call → updates all 3 files.
 */
export async function refreshSteering({ cwd = process.cwd(), silent = false, structuralChange = false } = {}) {
  const steeringDir = path.join(cwd, getConfig(cwd).steeringDir);
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
        console.log(chalk.dim(`  Steering docs updated (${getConfig(cwd).steeringDir}/)${extra}`));
      }
    }
  } catch (err) {
    debugLog('steering', `Refresh failed: ${err.message}`);
    if (!silent) warnLog(`Steering docs not updated: ${err.message}`);
  }
}

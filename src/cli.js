/**
 * sdd-kit CLI
 * Language-agnostic Spec-Driven Development tool.
 * Works with any project: React, FastAPI, Laravel, Rails, etc.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createCmd }   from './commands/spec/create.js';
import { documentCmd } from './commands/spec/document.js';
import { statusCmd }   from './commands/spec/status.js';
import { executeCmd }  from './commands/spec/execute.js';
import { refreshCmd }  from './commands/spec/refresh.js';
import { archCmd }     from './commands/arch.js';

const program = new Command();

program
  .name('sdd')
  .description('🧠 Spec-Driven Development Kit — language agnostic, AI-powered')
  .version('0.2.0')
  .addHelpText('after', `
${chalk.bold('Quick start:')}
  ${chalk.cyan('sdd spec create')} "JWT authentication"          ${chalk.dim('→ new feature spec')}
  ${chalk.cyan('sdd spec create')} "Fix 422 on login" --size small ${chalk.dim('→ just tasks')}
  ${chalk.cyan('sdd spec document')} src/auth/                    ${chalk.dim('→ reverse engineer code')}
  ${chalk.cyan('sdd spec status')}                               ${chalk.dim('→ project overview')}
  ${chalk.cyan('sdd arch')}                                      ${chalk.dim('→ architecture dashboard')}

${chalk.bold('Spec sizes:')}
  ${chalk.red('small')}   tasks.md only          bug fixes, tweaks
  ${chalk.yellow('medium')}  requirements + tasks   clear features (1-3 days)
  ${chalk.green('large')}   full spec (3 files)    complex / new architecture
  `);

// ─── sdd spec ─────────────────────────────────────────────────────────────

const spec = program.command('spec').description('Spec management commands');

spec
  .command('create <description>')
  .description('Create a new spec from a feature description')
  .option('-n, --name <name>',       'Spec name (default: auto-generated)')
  .option('-s, --size <size>',       'Spec size: small | medium | large', 'large')
  .option('-p, --prompt-only',       'Generate Claude Code prompt (no API call)')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  sdd spec create "Fix 422 on login endpoint" --size small
  sdd spec create "JWT refresh tokens" --size medium
  sdd spec create "Hybrid RAG search pipeline" --name rag-search
  sdd spec create "WhatsApp webhook flow" --prompt-only
  `)
  .action((description, opts) => {
    const validSizes = ['small', 'medium', 'large'];
    if (!validSizes.includes(opts.size)) {
      console.error(chalk.red(`\n  Invalid size '${opts.size}'. Use: small | medium | large\n`));
      process.exit(1);
    }
    createCmd({ description, name: opts.name, size: opts.size, promptOnly: opts.promptOnly || false });
  });

spec
  .command('document <path>')
  .description('Reverse engineer existing code into a spec')
  .option('-n, --name <name>',  'Spec name (default: derived from path)')
  .option('-p, --prompt-only',  'Save prompt instead of invoking Claude Code')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  sdd spec document src/auth/
  sdd spec document app/services/rag_service.py --name rag-service
  sdd spec document src/components/Dashboard.tsx --prompt-only
  `)
  .action((source, opts) => {
    documentCmd({ source, name: opts.name, promptOnly: opts.promptOnly || false });
  });

spec
  .command('execute <spec-name>')
  .description('Execute tasks from a spec (generates Claude Code prompt)')
  .option('-t, --task <id>',   'Specific task ID (default: next pending)')
  .option('--dry-run',         'Show what would be done without output')
  .option('-p, --prompt-only', 'Alias for default behavior')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  sdd spec execute feat-jwt-auth
  sdd spec execute feat-jwt-auth --task 1.2
  sdd spec execute feat-rag-search --dry-run
  `)
  .action((specName, opts) => {
    executeCmd({ specName, taskId: opts.task, dryRun: opts.dryRun, promptOnly: opts.promptOnly });
  });

spec
  .command('status [spec-name]')
  .description('Show spec progress and project overview')
  .option('-v, --verbose', 'Show individual task details')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  sdd spec status
  sdd spec status feat-jwt-auth --verbose
  `)
  .action((specName, opts) => {
    statusCmd({ specName, verbose: opts.verbose });
  });

spec
  .command('refresh [dir]')
  .description('Update module specs (living documentation)')
  .option('-p, --prompt-only', 'Skip Claude Code (no-op for refresh)')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  sdd spec refresh                ${chalk.dim('→ refresh all module specs')}
  sdd spec refresh src/core       ${chalk.dim('→ refresh one directory')}
  `)
  .action((dir, opts) => {
    refreshCmd({ dir, promptOnly: opts.promptOnly || false });
  });

// ─── sdd arch ─────────────────────────────────────────────────────────────

program
  .command('arch')
  .description('Generate architecture views from all specs')
  .option('-l, --level <level>',  'View level: system | services | modules', 'system')
  .option('-f, --flow <feature>', 'Show flow diagram for a specific feature')
  .option('-o, --output <path>',  'Output directory (default: specs/_arch/)')
  .option('-p, --prompt-only',    'Generate Claude Code prompt (no API call)')
  .addHelpText('after', `
${chalk.bold('Output:')}
  specs/_arch/architecture.md   ${chalk.dim('Mermaid diagrams — renders on GitHub')}
  specs/_arch/dashboard.html    ${chalk.dim('Interactive dashboard — open in browser')}

${chalk.bold('Examples:')}
  sdd arch
  sdd arch --level services
  sdd arch --flow feat-jwt-auth
  sdd arch --prompt-only
  `)
  .action((opts) => {
    archCmd({ level: opts.level, flow: opts.flow, output: opts.output, promptOnly: opts.promptOnly || false });
  });

// ─── sdd init ─────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize sdd-kit in current project (creates steering docs)')
  .option('-a, --auto', 'Auto-generate steering docs from module specs (requires sdd spec document first)')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  sdd init                ${chalk.dim('→ create template steering docs (manual edit)')}
  sdd init --auto         ${chalk.dim('→ auto-generate from specs/_modules/')}
  `)
  .action((opts) => {
    import('./commands/init.js').then(m => m.initCmd({ auto: opts.auto || false }));
  });

program.parse();

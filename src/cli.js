/**
 * sdd-kit CLI
 * Spec-Driven Development tool for Claude Code.
 * Language-agnostic — works with any project.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createCmd }   from './commands/spec/create.js';
import { documentCmd } from './commands/spec/document.js';
import { statusCmd }   from './commands/spec/status.js';
import { executeCmd }  from './commands/spec/execute.js';
import { refreshCmd }  from './commands/spec/refresh.js';
import { archCmd }     from './commands/arch.js';

// ─── Language detection ──────────────────────────────────────────────────────

const LANG = (process.env.SDD_LANG || process.env.LANG || 'en').toLowerCase();
const isES = LANG.startsWith('es');

const t = isES ? {
  desc: 'Kit de Desarrollo Guiado por Specs — para Claude Code',
  quickStart: 'Inicio rápido:',
  allCommands: 'Todos los comandos:',
  specSizes: 'Tamaños de spec:',
  specDesc: 'Comandos de gestión de specs',
  createDesc: 'Crear spec desde una descripción de feature',
  createOptName: 'Nombre del spec (default: auto-generado)',
  createOptSize: 'Tamaño: small | medium | large',
  createOptPrompt: 'Generar prompt sin ejecutar Claude Code',
  documentDesc: 'Documentar código existente en un spec',
  documentOptName: 'Nombre del spec (default: derivado del path)',
  documentOptPrompt: 'Guardar prompt en vez de invocar Claude Code',
  executeDesc: 'Ejecutar la siguiente tarea de un spec via Claude Code',
  executeOptTask: 'ID de tarea específica (default: siguiente pendiente)',
  executeOptDry: 'Mostrar qué se haría sin ejecutar',
  executeOptPrompt: 'Generar prompt sin ejecutar',
  statusDesc: 'Ver progreso del proyecto y specs',
  statusOptVerbose: 'Mostrar detalle de tareas individuales',
  refreshDesc: 'Actualizar specs del mapa del proyecto (documentación viva)',
  refreshOptPrompt: 'No ejecutar (requiere engine)',
  archDesc: 'Generar vistas de arquitectura desde todos los specs',
  archOptLevel: 'Nivel: system | services | modules',
  archOptFlow: 'Diagrama de flujo para un feature específico',
  archOptOutput: 'Directorio de salida (default: specs/_arch/)',
  archOptPrompt: 'Generar prompt sin ejecutar Claude Code',
  initDesc: 'Inicializar sdd-kit en el proyecto (crea steering docs + CLAUDE.md)',
  initOptAuto: 'Auto-generar steering desde specs del mapa (requiere sdd spec document primero)',
  examples: 'Ejemplos:',
  output: 'Salida:',
  sizeSmall: 'solo tasks.md          bug fixes, ajustes',
  sizeMedium: 'requirements + tasks   features claros (1-3 días)',
  sizeLarge: 'spec completo (3 arch)  features complejos / nueva arquitectura',
  newSpec: 'nuevo spec de feature',
  justTasks: 'solo tareas',
  reverseEng: 'documentar código existente',
  projectOverview: 'resumen del proyecto',
  archDashboard: 'dashboard de arquitectura',
  refreshAll: 'refrescar todo el mapa',
  refreshOne: 'refrescar un directorio',
  initManual: 'crear steering docs (edición manual)',
  initAuto: 'auto-generar desde specs/_map/',
  executeSpec: 'ejecutar siguiente tarea',
  executeTask: 'ejecutar tarea específica',
  executeDry: 'vista previa sin ejecutar',
  mermaid: 'Diagramas Mermaid — se ven en GitHub',
  dashboard: 'Dashboard interactivo — abrir en navegador',
} : {
  desc: 'Spec-Driven Development Kit — for Claude Code',
  quickStart: 'Quick start:',
  allCommands: 'All commands:',
  specSizes: 'Spec sizes:',
  specDesc: 'Spec management commands',
  createDesc: 'Create a new spec from a feature description',
  createOptName: 'Spec name (default: auto-generated)',
  createOptSize: 'Spec size: small | medium | large',
  createOptPrompt: 'Generate prompt without running Claude Code',
  documentDesc: 'Reverse engineer existing code into a spec',
  documentOptName: 'Spec name (default: derived from path)',
  documentOptPrompt: 'Save prompt instead of invoking Claude Code',
  executeDesc: 'Execute next task from a spec via Claude Code',
  executeOptTask: 'Specific task ID (default: next pending)',
  executeOptDry: 'Show what would be done without executing',
  executeOptPrompt: 'Generate prompt without executing',
  statusDesc: 'Show spec progress and project overview',
  statusOptVerbose: 'Show individual task details',
  refreshDesc: 'Update project map specs (living documentation)',
  refreshOptPrompt: 'Skip execution (requires engine)',
  archDesc: 'Generate architecture views from all specs',
  archOptLevel: 'View level: system | services | modules',
  archOptFlow: 'Show flow diagram for a specific feature',
  archOptOutput: 'Output directory (default: specs/_arch/)',
  archOptPrompt: 'Generate prompt without running Claude Code',
  initDesc: 'Initialize sdd-kit in project (creates steering docs + CLAUDE.md)',
  initOptAuto: 'Auto-generate steering from map specs (requires sdd spec document first)',
  examples: 'Examples:',
  output: 'Output:',
  sizeSmall: 'tasks.md only          bug fixes, tweaks',
  sizeMedium: 'requirements + tasks   clear features (1-3 days)',
  sizeLarge: 'full spec (3 files)    complex / new architecture',
  newSpec: 'new feature spec',
  justTasks: 'just tasks',
  reverseEng: 'reverse engineer code',
  projectOverview: 'project overview',
  archDashboard: 'architecture dashboard',
  refreshAll: 'refresh all map specs',
  refreshOne: 'refresh one directory',
  initManual: 'create template steering docs (manual edit)',
  initAuto: 'auto-generate from specs/_map/',
  executeSpec: 'execute next task',
  executeTask: 'execute specific task',
  executeDry: 'preview without executing',
  mermaid: 'Mermaid diagrams — renders on GitHub',
  dashboard: 'Interactive dashboard — open in browser',
};

const program = new Command();

program
  .name('sdd')
  .description(`🧠 ${t.desc}`)
  .version('0.3.2')
  .configureHelp({
    visibleCommands(cmd) {
      const cmds = [];
      for (const sub of cmd.commands) {
        if (sub.commands.length > 0) {
          for (const child of sub.commands) {
            child._sddPrefix = sub.name();
            cmds.push(child);
          }
        } else {
          cmds.push(sub);
        }
      }
      return cmds.filter(c => c.name() !== 'help');
    },
    subcommandTerm(cmd) {
      const prefix = cmd._sddPrefix ? `${cmd._sddPrefix} ` : '';
      // Call default formatting then prepend prefix
      const term = this.constructor.prototype.subcommandTerm.call(this, cmd);
      return `${prefix}${term}`;
    },
  })
  .addHelpText('after', `
${chalk.bold(t.quickStart)}
  ${chalk.cyan('sdd init')}                                       ${chalk.dim(`→ ${t.initManual}`)}
  ${chalk.cyan('sdd spec create')} "JWT authentication"           ${chalk.dim(`→ ${t.newSpec}`)}
  ${chalk.cyan('sdd spec document')} src/auth/                    ${chalk.dim(`→ ${t.reverseEng}`)}
  ${chalk.cyan('sdd spec execute')} feat-jwt-auth                 ${chalk.dim(`→ ${t.executeSpec}`)}
  ${chalk.cyan('sdd spec status')}                                ${chalk.dim(`→ ${t.projectOverview}`)}
  ${chalk.cyan('sdd spec refresh')}                               ${chalk.dim(`→ ${t.refreshAll}`)}
  ${chalk.cyan('sdd arch')}                                       ${chalk.dim(`→ ${t.archDashboard}`)}

${chalk.bold(t.specSizes)}
  ${chalk.red('small')}   ${t.sizeSmall}
  ${chalk.yellow('medium')}  ${t.sizeMedium}
  ${chalk.green('large')}   ${t.sizeLarge}
  `);

// ─── sdd spec ─────────────────────────────────────────────────────────────

const spec = program.command('spec').description(t.specDesc);

spec
  .command('create <description>')
  .description(t.createDesc)
  .option('-n, --name <name>',  t.createOptName)
  .option('-s, --size <size>',  t.createOptSize, 'large')
  .option('-p, --prompt-only',  t.createOptPrompt)
  .addHelpText('after', `
${chalk.bold(t.examples)}
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
  .description(t.documentDesc)
  .option('-n, --name <name>',  t.documentOptName)
  .option('-p, --prompt-only',  t.documentOptPrompt)
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec document src/auth/
  sdd spec document app/services/rag_service.py --name rag-service
  sdd spec document src/components/Dashboard.tsx --prompt-only
  `)
  .action((source, opts) => {
    documentCmd({ source, name: opts.name, promptOnly: opts.promptOnly || false });
  });

spec
  .command('execute <spec-name>')
  .description(t.executeDesc)
  .option('-t, --task <id>',   t.executeOptTask)
  .option('--dry-run',         t.executeOptDry)
  .option('-p, --prompt-only', t.executeOptPrompt)
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec execute feat-jwt-auth                ${chalk.dim(`→ ${t.executeSpec}`)}
  sdd spec execute feat-jwt-auth --task 1.2     ${chalk.dim(`→ ${t.executeTask}`)}
  sdd spec execute feat-rag-search --dry-run    ${chalk.dim(`→ ${t.executeDry}`)}
  `)
  .action((specName, opts) => {
    executeCmd({ specName, taskId: opts.task, dryRun: opts.dryRun, promptOnly: opts.promptOnly });
  });

spec
  .command('status [spec-name]')
  .description(t.statusDesc)
  .option('-v, --verbose', t.statusOptVerbose)
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec status
  sdd spec status feat-jwt-auth --verbose
  `)
  .action((specName, opts) => {
    statusCmd({ specName, verbose: opts.verbose });
  });

spec
  .command('refresh [dir]')
  .description(t.refreshDesc)
  .option('-p, --prompt-only', t.refreshOptPrompt)
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec refresh                ${chalk.dim(`→ ${t.refreshAll}`)}
  sdd spec refresh src/core       ${chalk.dim(`→ ${t.refreshOne}`)}
  `)
  .action((dir, opts) => {
    refreshCmd({ dir, promptOnly: opts.promptOnly || false });
  });

// ─── sdd arch ─────────────────────────────────────────────────────────────

program
  .command('arch')
  .description(t.archDesc)
  .option('-l, --level <level>',  t.archOptLevel, 'system')
  .option('-f, --flow <feature>', t.archOptFlow)
  .option('-o, --output <path>',  t.archOptOutput)
  .option('-p, --prompt-only',    t.archOptPrompt)
  .addHelpText('after', `
${chalk.bold(t.output)}
  specs/_arch/architecture.md   ${chalk.dim(t.mermaid)}
  specs/_arch/dashboard.html    ${chalk.dim(t.dashboard)}

${chalk.bold(t.examples)}
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
  .description(t.initDesc)
  .option('-a, --auto', t.initOptAuto)
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd init                ${chalk.dim(`→ ${t.initManual}`)}
  sdd init --auto         ${chalk.dim(`→ ${t.initAuto}`)}
  `)
  .action((opts) => {
    import('./commands/init.js').then(m => m.initCmd({ auto: opts.auto || false }));
  });

program.parse();

/**
 * sdd-kit CLI
 * Spec-Driven Development tool for Claude Code.
 * Language-agnostic — works with any project.
 */

import { Command, Option } from 'commander';
import chalk from 'chalk';
import { createCmd }   from './commands/spec/create.js';
import { documentCmd } from './commands/spec/document.js';
import { statusCmd }   from './commands/spec/status.js';
import { executeCmd }  from './commands/spec/execute.js';
import { refreshCmd }  from './commands/spec/refresh.js';
import { listCmd }     from './commands/spec/list.js';
import { deleteCmd }   from './commands/spec/delete.js';
import { renameCmd }   from './commands/spec/rename.js';
import { archiveCmd }  from './commands/spec/archive.js';
import { archCmd }     from './commands/arch.js';
import { configCmd }   from './commands/config.js';

// ─── Language detection ──────────────────────────────────────────────────────

const LANG = (process.env.SDD_LANG || process.env.LANG || 'en').toLowerCase();
const isES = LANG.startsWith('es');

const t = isES ? {
  desc: 'Kit de Desarrollo Guiado por Specs — para Claude Code',
  quickStart: 'Inicio rápido:',
  specLevels: 'Niveles de spec:',
  specDesc: 'Comandos de gestión de specs',
  createDesc: 'Crear scaffold de spec para un feature',
  createOptName: 'Nombre del spec (default: auto-generado)',
  documentDesc: 'Documentar código existente en un spec',
  documentOptName: 'Nombre del spec (default: derivado del path)',
  documentOptPrompt: 'Guardar prompt en vez de invocar Claude Code',
  executeDesc: 'Ejecutar la siguiente tarea de un spec via Claude Code',
  executeOptTask: 'ID de tarea específica (default: siguiente pendiente)',
  executeOptDry: 'Mostrar qué se haría sin ejecutar',
  executeOptPrompt: 'Generar prompt sin ejecutar',
  executeOptRefresh: 'Refresh de módulos tras la tarea',
  statusDesc: 'Ver progreso del proyecto y specs',
  statusOptVerbose: 'Mostrar detalle de tareas individuales',
  refreshDesc: 'Actualizar specs del mapa del proyecto (documentación viva)',
  refreshOptPrompt: 'No ejecutar (requiere engine)',
  refreshOptVerbose: 'Specs más detallados (presupuesto de tokens mayor)',
  refreshOptForce: 'Regenerar todos los specs ignorando el hash cacheado',
  refreshOptDeep: 'Enviar contenido completo truncado en vez de resumen de símbolos (más caro, mayor fidelidad)',
  archDesc: 'Generar vistas de arquitectura desde todos los specs',
  archOptLevel: 'Nivel: system | services | modules',
  archOptFlow: 'Diagrama de flujo para un feature específico',
  archOptOutput: 'Directorio de salida (default: specs/_arch/)',
  archOptPrompt: 'Generar prompt sin ejecutar Claude Code',
  initDesc: 'Inicializar sdd-kit en el proyecto (crea steering docs + CLAUDE.md)',
  initOptAuto: 'Auto-generar steering desde specs del mapa (requiere sdd spec document primero)',
  examples: 'Ejemplos:',
  output: 'Salida:',
  level1: 'solo tasks.md            bug fixes, ajustes',
  level2: 'requirements + tasks     default — features claros (1-3 días)',
  level3: 'spec completo (3 arch)   features complejos / arquitectura nueva',
  newSpec: 'nuevo spec de feature',
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
  specLevels: 'Spec levels:',
  specDesc: 'Spec management commands',
  createDesc: 'Scaffold a new spec for a feature',
  createOptName: 'Spec name (default: auto-generated)',
  documentDesc: 'Reverse engineer existing code into a spec',
  documentOptName: 'Spec name (default: derived from path)',
  documentOptPrompt: 'Save prompt instead of invoking Claude Code',
  executeDesc: 'Execute next task from a spec via Claude Code',
  executeOptTask: 'Specific task ID (default: next pending)',
  executeOptDry: 'Show what would be done without executing',
  executeOptPrompt: 'Generate prompt without executing',
  executeOptRefresh: 'Module refresh after task',
  statusDesc: 'Show spec progress and project overview',
  statusOptVerbose: 'Show individual task details',
  refreshDesc: 'Update project map specs (living documentation)',
  refreshOptPrompt: 'Skip execution (requires engine)',
  refreshOptVerbose: 'More detailed specs (higher token budget)',
  refreshOptForce: 'Regenerate every spec ignoring the cached hash',
  refreshOptDeep: 'Send full truncated file contents instead of symbol summaries (costlier, higher fidelity)',
  archDesc: 'Generate architecture views from all specs',
  archOptLevel: 'View level: system | services | modules',
  archOptFlow: 'Show flow diagram for a specific feature',
  archOptOutput: 'Output directory (default: specs/_arch/)',
  archOptPrompt: 'Generate prompt without running Claude Code',
  initDesc: 'Initialize sdd-kit in project (creates steering docs + CLAUDE.md)',
  initOptAuto: 'Auto-generate steering from map specs (requires sdd spec document first)',
  examples: 'Examples:',
  output: 'Output:',
  level1: 'tasks.md only            bug fixes, tweaks',
  level2: 'requirements + tasks     default — clear features (1-3 days)',
  level3: 'full spec (3 files)      complex / new architecture',
  newSpec: 'new feature spec',
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
  .version('0.6.0')
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
  ${chalk.cyan('sdd spec list')}                                  ${chalk.dim(`→ ${isES ? 'listar todos los specs' : 'list all specs'}`)}
  ${chalk.cyan('sdd spec refresh')}                               ${chalk.dim(`→ ${t.refreshAll}`)}
  ${chalk.cyan('sdd arch')}                                       ${chalk.dim(`→ ${t.archDashboard}`)}
  ${chalk.cyan('sdd config')}                                     ${chalk.dim(`→ ${isES ? 'ver configuración activa' : 'show active config'}`)}

${chalk.bold(t.specLevels)}
  ${chalk.red('-1')}   ${t.level1}
  ${chalk.yellow('-2')}   ${t.level2}
  ${chalk.green('-3')}   ${t.level3}
  `);

// ─── sdd spec ─────────────────────────────────────────────────────────────

const spec = program.command('spec').description(t.specDesc);

spec
  .command('create [description]')
  .description(t.createDesc)
  .option('-n, --name <name>',  t.createOptName)
  .option('-1', 'tasks.md only')
  .option('-2', 'requirements.md + tasks.md (default)')
  .option('-3', 'full spec: requirements + design + tasks')
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec create "Fix 422 on login endpoint" -1      ${chalk.dim('→ tasks only')}
  sdd spec create "JWT refresh tokens"                 ${chalk.dim('→ req + tasks (default)')}
  sdd spec create "Hybrid RAG search pipeline" -3      ${chalk.dim('→ full spec')}
  sdd spec create --name feat-whatsapp-flow            ${chalk.dim('→ name only')}
  `)
  .action((description, opts) => {
    const level = opts[1] ? 1 : opts[3] ? 3 : 2;
    createCmd({ description, name: opts.name, level });
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
  .addOption(new Option('--refresh <mode>', t.executeOptRefresh).choices(['auto', 'structural', 'off']).default('structural'))
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec execute feat-jwt-auth                 ${chalk.dim(`→ ${t.executeSpec}`)}
  sdd spec execute feat-jwt-auth --task 1.2      ${chalk.dim(`→ ${t.executeTask}`)}
  sdd spec execute feat-rag-search --dry-run     ${chalk.dim(`→ ${t.executeDry}`)}
  sdd spec execute feat-jwt-auth --refresh=off   ${chalk.dim('→ skip module/steering refresh')}
  sdd spec execute feat-jwt-auth --refresh=auto  ${chalk.dim('→ refresh on any change (old behavior)')}
  `)
  .action((specName, opts) => {
    executeCmd({ specName, taskId: opts.task, dryRun: opts.dryRun, promptOnly: opts.promptOnly, refreshMode: opts.refresh });
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
  .option('-v, --verbose', t.refreshOptVerbose)
  .option('-f, --force', t.refreshOptForce)
  .option('-d, --deep', t.refreshOptDeep)
  .addHelpText('after', `
${chalk.bold(t.examples)}
  sdd spec refresh                ${chalk.dim(`→ ${t.refreshAll}`)}
  sdd spec refresh src/core       ${chalk.dim(`→ ${t.refreshOne}`)}
  sdd spec refresh --verbose      ${chalk.dim('→ higher token budget (2000 vs 1000)')}
  sdd spec refresh --force        ${chalk.dim('→ regenerate everything (ignore cached hash)')}
  sdd spec refresh --deep         ${chalk.dim('→ send full contents instead of symbol summaries')}
  `)
  .action((dir, opts) => {
    refreshCmd({
      dir,
      promptOnly: opts.promptOnly || false,
      verbose: opts.verbose || false,
      force: opts.force || false,
      deep: opts.deep || false,
    });
  });

spec
  .command('list')
  .description(isES ? 'Listar todos los specs' : 'List all specs')
  .action(() => {
    listCmd();
  });

spec
  .command('delete <name>')
  .description(isES ? 'Eliminar un spec' : 'Delete a spec')
  .option('--force', isES ? 'Borrar sin confirmación' : 'Delete without confirmation')
  .action((name, opts) => {
    deleteCmd({ specName: name, force: opts.force || false });
  });

spec
  .command('rename <old> <new>')
  .description(isES ? 'Renombrar un spec' : 'Rename a spec')
  .action((oldName, newName) => {
    renameCmd({ oldName, newName });
  });

spec
  .command('archive <name>')
  .description(isES ? 'Archivar un spec completado' : 'Archive a completed spec')
  .option('--restore', isES ? 'Restaurar spec archivado' : 'Restore archived spec')
  .action((name, opts) => {
    archiveCmd({ specName: name, restore: opts.restore || false });
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

// ─── sdd config ──────────────────────────────────────────────────────────

program
  .command('config')
  .description(isES ? 'Mostrar configuración activa' : 'Show active configuration')
  .action(() => {
    configCmd();
  });

program.parse();

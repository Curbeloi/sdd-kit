/**
 * sdd spec status — show project and spec progress
 */

import chalk from 'chalk';
import { readAllSpecs, readSpec } from '../../core/spec-reader.js';

export async function statusCmd({ specName, verbose, cwd = process.cwd() }) {
  if (specName) {
    const spec = readSpec(cwd, specName);
    if (!spec) {
      console.error(chalk.red(`\n  Spec not found: ${specName}`));
      console.log(chalk.dim(`  Run \`sdd spec list\` to see available specs.\n`));
      process.exitCode = 1;
      return;
    }
    console.log(`\n${chalk.bold('sdd spec status')} — ${chalk.cyan(specName)}\n`);
    showSpecSummary(spec);
    showSpecTasks(spec);
    console.log('');
    return;
  }

  const specs = readAllSpecs(cwd);
  if (!specs.length) {
    console.log(chalk.yellow('\n  No specs found. Run `sdd spec create` first.\n'));
    return;
  }

  const totalTasks = specs.reduce((n, s) => n + s.tasks.length, 0);
  const totalDone = specs.reduce((n, s) => n + s.tasks.filter(t => t.done).length, 0);
  const pct = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0;

  console.log(`\n${chalk.bold('SDD Project Status')}\n`);
  console.log(chalk.dim(`  ${specs.length} specs · ${totalDone}/${totalTasks} tasks · ${progressBar(pct, 20)} ${pct}%\n`));

  for (const spec of specs) {
    showSpecSummary(spec);
    if (verbose) showSpecTasks(spec, '    ');
  }
  console.log('');
}

function showSpecSummary(spec, indent = '  ') {
  const done = spec.tasks.filter(t => t.done).length;
  const total = spec.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = progressBar(pct, 16);
  const status = total === 0 ? chalk.dim('planned') : pct === 100 ? chalk.green('done') : chalk.yellow(`${pct}%`);

  // File indicators
  const r = spec.files.requirements ? chalk.green('R') : chalk.dim('R');
  const d = spec.files.design ? chalk.green('D') : chalk.dim('D');
  const t = total > 0 ? chalk.green('T') : chalk.dim('T');

  console.log(`${indent}${chalk.bold(spec.name.padEnd(28))} ${r}${d}${t}  ${bar} ${done}/${total} ${status}`);
}

function showSpecTasks(spec, indent = '  ') {
  for (const t of spec.tasks) {
    const check = t.done ? chalk.green('[x]') : chalk.dim('[ ]');
    const file = t.file ? chalk.dim(` ${t.file}`) : '';
    console.log(`${indent}${check} ${chalk.bold(t.id)} ${t.desc}${file}`);
  }
}

function progressBar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  const color = pct === 100 ? chalk.green : pct > 50 ? chalk.yellow : chalk.red;
  return color('\u2588'.repeat(filled)) + chalk.dim('\u2591'.repeat(empty));
}

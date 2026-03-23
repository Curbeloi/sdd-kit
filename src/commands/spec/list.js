/**
 * sdd spec list — list all specs with summary info
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { readAllSpecs } from '../../core/spec-reader.js';
import { getConfig } from '../../core/config.js';

export function listCmd({ cwd = process.cwd() } = {}) {
  console.log(`\n${chalk.bold('sdd spec list')}\n`);

  const specs = readAllSpecs(cwd);

  if (specs.length === 0) {
    console.log(chalk.dim('  No specs found. Create one with: sdd spec create "feature"\n'));
    return;
  }

  const config = getConfig(cwd);

  for (const spec of specs) {
    const hasR = spec.files.requirements ? chalk.green('R') : chalk.dim('-');
    const hasD = spec.files.design ? chalk.green('D') : chalk.dim('-');
    const hasT = spec.tasks.length > 0 ? chalk.green('T') : chalk.dim('-');

    const done = spec.tasks.filter(t => t.done).length;
    const total = spec.tasks.length;

    let status;
    if (total === 0) status = chalk.dim('empty');
    else if (done === total) status = chalk.green('done');
    else status = chalk.yellow(`${done}/${total}`);

    // Get creation date from directory stat
    const specDir = path.join(cwd, config.specsDir, spec.name);
    let dateStr = '';
    try {
      const stat = fs.statSync(specDir);
      dateStr = stat.birthtime.toISOString().slice(0, 10);
    } catch {
      dateStr = '';
    }

    console.log(`  ${chalk.cyan(spec.name.padEnd(30))} ${hasR}${hasD}${hasT}  ${status.padEnd(20)} ${chalk.dim(dateStr)}`);
  }

  console.log('');
}

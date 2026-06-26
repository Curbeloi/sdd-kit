/**
 * sdd spec delete — delete a spec directory
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';
import { resolveSpecDir } from '../../core/spec-reader.js';

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

export async function deleteCmd({ specName, force = false, cwd = process.cwd() }) {
  const specDir = resolveSpecDir(cwd, specName);

  if (!specDir) {
    console.error(chalk.red(`\n  Spec not found: ${specName}\n`));
    return;
  }

  const relDir = path.relative(cwd, specDir);
  const files = fs.readdirSync(specDir);
  console.log(`\n${chalk.bold('sdd spec delete')} — ${chalk.cyan(specName)} ${chalk.dim(relDir + '/')}`);
  console.log(chalk.dim(`  Files: ${files.join(', ')}\n`));

  if (!force) {
    const confirmed = await confirm(`  Delete ${specName}? (y/N) `);
    if (!confirmed) {
      console.log(chalk.dim('  Cancelled.\n'));
      return;
    }
  }

  fs.rmSync(specDir, { recursive: true, force: true });
  console.log(chalk.green(`  Deleted ${relDir}/\n`));
}

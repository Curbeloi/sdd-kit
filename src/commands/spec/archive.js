/**
 * sdd spec archive — move spec to/from archived directory
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { resolveSpecDir, specDestDir } from '../../core/spec-reader.js';

export function archiveCmd({ specName, restore = false, cwd = process.cwd() }) {
  const archivedDir = path.join(cwd, 'specs', 'archived');

  if (restore) {
    // Restore from archived → route back to the type folder its name implies.
    const src = path.join(archivedDir, specName);
    const dest = specDestDir(cwd, specName);

    if (!fs.existsSync(src)) {
      console.error(chalk.red(`\n  Archived spec not found: ${specName}`));
      console.log(chalk.dim(`  Expected: specs/archived/${specName}/\n`));
      return;
    }

    if (fs.existsSync(dest)) {
      console.error(chalk.red(`\n  Spec already exists: ${specName}`));
      console.log(chalk.dim(`  Delete or rename the existing spec first.\n`));
      return;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    console.log(`\n${chalk.bold('sdd spec archive --restore')} — ${chalk.cyan(specName)}`);
    console.log(chalk.green(`  Restored specs/archived/${specName}/ → ${path.relative(cwd, dest)}/\n`));
  } else {
    // Archive from wherever the spec currently lives.
    const src = resolveSpecDir(cwd, specName);
    const dest = path.join(archivedDir, specName);

    if (!src) {
      console.error(chalk.red(`\n  Spec not found: ${specName}\n`));
      return;
    }

    fs.mkdirSync(archivedDir, { recursive: true });
    fs.renameSync(src, dest);
    console.log(`\n${chalk.bold('sdd spec archive')} — ${chalk.cyan(specName)}`);
    console.log(chalk.green(`  Archived ${path.relative(cwd, src)}/ → specs/archived/${specName}/\n`));
  }
}

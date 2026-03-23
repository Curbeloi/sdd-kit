/**
 * sdd spec archive — move spec to/from archived directory
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getConfig } from '../../core/config.js';

export function archiveCmd({ specName, restore = false, cwd = process.cwd() }) {
  const config = getConfig(cwd);
  const featuresDir = path.join(cwd, config.specsDir);
  const archivedDir = path.join(cwd, 'specs', 'archived');

  if (restore) {
    // Restore from archived
    const src = path.join(archivedDir, specName);
    const dest = path.join(featuresDir, specName);

    if (!fs.existsSync(src)) {
      console.error(chalk.red(`\n  Archived spec not found: ${specName}`));
      console.log(chalk.dim(`  Expected: specs/archived/${specName}/\n`));
      return;
    }

    if (fs.existsSync(dest)) {
      console.error(chalk.red(`\n  Spec already exists in features: ${specName}`));
      console.log(chalk.dim(`  Delete or rename the existing spec first.\n`));
      return;
    }

    fs.renameSync(src, dest);
    console.log(`\n${chalk.bold('sdd spec archive --restore')} — ${chalk.cyan(specName)}`);
    console.log(chalk.green(`  Restored specs/archived/${specName}/ → ${config.specsDir}/${specName}/\n`));
  } else {
    // Archive from features
    const src = path.join(featuresDir, specName);
    const dest = path.join(archivedDir, specName);

    if (!fs.existsSync(src)) {
      console.error(chalk.red(`\n  Spec not found: ${specName}`));
      console.log(chalk.dim(`  Expected: ${config.specsDir}/${specName}/\n`));
      return;
    }

    fs.mkdirSync(archivedDir, { recursive: true });
    fs.renameSync(src, dest);
    console.log(`\n${chalk.bold('sdd spec archive')} — ${chalk.cyan(specName)}`);
    console.log(chalk.green(`  Archived ${config.specsDir}/${specName}/ → specs/archived/${specName}/\n`));
  }
}

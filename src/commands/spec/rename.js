/**
 * sdd spec rename — rename a spec directory and update headers
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getConfig } from '../../core/config.js';

export function renameCmd({ oldName, newName, cwd = process.cwd() }) {
  const config = getConfig(cwd);
  const oldDir = path.join(cwd, config.specsDir, oldName);
  const newDir = path.join(cwd, config.specsDir, newName);

  if (!fs.existsSync(oldDir)) {
    console.error(chalk.red(`\n  Spec not found: ${oldName}`));
    console.log(chalk.dim(`  Expected: ${config.specsDir}/${oldName}/\n`));
    return;
  }

  if (fs.existsSync(newDir)) {
    console.error(chalk.red(`\n  Destination already exists: ${newName}`));
    console.log(chalk.dim(`  Path: ${config.specsDir}/${newName}/\n`));
    return;
  }

  // Rename directory
  fs.renameSync(oldDir, newDir);

  // Update headers in markdown files
  let updated = 0;
  for (const file of fs.readdirSync(newDir).filter(f => f.endsWith('.md'))) {
    const filePath = path.join(newDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes(oldName)) {
      fs.writeFileSync(filePath, content.replaceAll(oldName, newName), 'utf-8');
      updated++;
    }
  }

  console.log(`\n${chalk.bold('sdd spec rename')} — ${chalk.dim(oldName)} → ${chalk.cyan(newName)}`);
  console.log(chalk.green(`  Renamed ${config.specsDir}/${oldName}/ → ${newName}/`));
  if (updated > 0) console.log(chalk.dim(`  Updated ${updated} file header(s)`));
  console.log('');
}

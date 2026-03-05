/**
 * sdd init — scaffold SDD structure in a project
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates/steering');

export async function initCmd(cwd = process.cwd()) {
  console.log(`\n${chalk.bold('sdd init')} — Setting up SDD in this project\n`);

  const steeringDir = path.join(cwd, '.claude', 'steering');
  const specsDir = path.join(cwd, 'specs', 'features');

  fs.mkdirSync(steeringDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });

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
    console.log(chalk.green(`  created  .claude/steering/${file}`));
    created++;
  }

  console.log('');
  if (created > 0) {
    console.log(chalk.bold('Next steps:'));
    console.log(chalk.cyan('  1. Edit .claude/steering/*.md with your project info'));
    console.log(chalk.cyan('  2. Run: sdd spec create "your first feature"'));
  } else {
    console.log(chalk.dim('  All steering files already exist. Ready to go.'));
  }
  console.log('');
}

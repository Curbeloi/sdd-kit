/**
 * sdd spec create — generate spec files from a feature description
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { readSteering } from '../../core/spec-reader.js';
import { generateCreateSpec, detectMode, Mode } from '../../core/generator.js';

const BUG_KEYWORDS = /\b(fix|bug|patch|typo|hotfix|broken|crash|error)\b/i;
const SMALL_KEYWORDS = /\b(rename|remove|delete|update|change|move|tweak)\b/i;

export async function createCmd({ description, name, size, promptOnly, cwd = process.cwd() }) {
  const specName = name || slugify(description);

  // Size hint
  if (size === 'large' && BUG_KEYWORDS.test(description)) {
    console.log(chalk.yellow(`\n  Hint: Looks like a small change — consider --size small`));
  } else if (size === 'large' && SMALL_KEYWORDS.test(description)) {
    console.log(chalk.yellow(`\n  Hint: Looks like a medium change — consider --size medium`));
  }

  const sizeLabel = { small: chalk.red('small'), medium: chalk.yellow('medium'), large: chalk.green('large') }[size];
  console.log(`\n${chalk.bold('sdd spec create')} — ${chalk.cyan(specName)} (${sizeLabel})\n`);

  const steering = readSteering(cwd);
  const projectContext = Object.values(steering).join('\n\n---\n\n') || '';

  const spinner = ora('Generating spec...').start();

  try {
    const result = await generateCreateSpec({ description, specName, size, projectContext, promptOnly });
    spinner.stop();

    const specDir = path.join(cwd, 'specs', 'features', specName);
    fs.mkdirSync(specDir, { recursive: true });

    if (result.mode === Mode.PROMPT) {
      const promptPath = path.join(specDir, 'create_prompt.md');
      fs.writeFileSync(promptPath, result.files.prompt, 'utf-8');
      console.log(chalk.yellow('  Prompt saved (no API key):'));
      console.log(chalk.dim(`  ${path.relative(cwd, promptPath)}`));
    } else {
      for (const [key, content] of Object.entries(result.files)) {
        const fp = path.join(specDir, `${key}.md`);
        fs.writeFileSync(fp, content, 'utf-8');
        console.log(`  ${chalk.green('created')} ${path.relative(cwd, fp)}`);
      }
    }
    console.log('');
  } catch (err) {
    spinner.fail('Failed to generate spec');
    console.error(chalk.red(`\n  ${err.message}`));
    if (err.message.includes('API') || err.message.includes('401')) {
      console.log(chalk.dim('  Set ANTHROPIC_API_KEY or use --prompt-only'));
    }
    console.log('');
  }
}

function slugify(s) {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug.startsWith('feat-') ? slug : `feat-${slug}`;
}

/**
 * sdd spec refresh — update module specs (living documentation)
 *
 * Uses unified claude-api (SDK or CLI auto-detected).
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { scanTree, groupByDirectory, readGroupFiles, buildGroupPrompt } from '../../core/scanner.js';
import { detectEngine, getEngineName, askClaude, batchAsk } from '../../core/claude-api.js';

/**
 * Refresh a single module spec. Used by execute.js post-task and by CLI command.
 */
export async function refreshModule({ dir, cwd }) {
  const resolvedDir = path.resolve(cwd, dir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) return;

  const tree = scanTree(resolvedDir);
  if (tree.files.length === 0) return;

  const groups = groupByDirectory(tree);
  const allFiles = [];
  for (const group of groups) {
    allFiles.push(...readGroupFiles(resolvedDir, group));
  }

  const label = dir.replace(/[/\\]+/g, '-').toLowerCase() || 'root';
  const prompt = buildGroupPrompt(label, allFiles);
  const analysis = await askClaude(prompt, { maxTokens: 2000, cwd });

  const mapDir = path.join(cwd, 'specs', '_map');
  fs.mkdirSync(mapDir, { recursive: true });
  const specPath = path.join(mapDir, `${label}.spec.md`);
  fs.writeFileSync(specPath, analysis, 'utf-8');
}

/**
 * CLI command: sdd spec refresh [dir]
 */
export async function refreshCmd({ dir, promptOnly, cwd = process.cwd() }) {
  console.log(`\n${chalk.bold('sdd spec refresh')} — ${chalk.cyan('update module specs')}`);
  console.log(chalk.dim(`  Engine: ${getEngineName()}\n`));

  if (promptOnly) {
    console.log(chalk.yellow('  Module refresh requires an engine (API key or Claude Code CLI).\n'));
    return;
  }

  if (dir) {
    const spinner = ora(`Refreshing module spec: ${dir}`).start();
    try {
      await refreshModule({ dir, cwd });
      spinner.succeed(`Module spec updated: ${dir}`);
    } catch (err) {
      spinner.fail(`Failed to refresh ${dir}`);
      console.error(chalk.red(`  ${err.message}`));
    }
  } else {
    // Refresh all directories
    const tree = scanTree(cwd);
    const groups = groupByDirectory(tree);

    if (groups.length === 0) {
      console.log(chalk.yellow('  No source files found.\n'));
      return;
    }

    console.log(chalk.dim(`  Found ${groups.length} directory groups to refresh\n`));

    const items = groups.map(group => {
      const label = group.dir === '.' ? 'root' : group.dir;
      const fileContents = readGroupFiles(cwd, group);
      const prompt = buildGroupPrompt(label, fileContents);
      return { prompt, label };
    });

    const spinners = new Map();
    const startTimes = new Map();

    for (let i = 0; i < items.length; i++) {
      const spinner = ora(`  [${i + 1}/${items.length}] ${chalk.blue(items[i].label)} — waiting...`).start();
      spinners.set(i, spinner);
      startTimes.set(i, Date.now());
    }

    const heartbeat = setInterval(() => {
      for (const [i, spinner] of spinners) {
        if (spinner.isSpinning) {
          const s = Math.floor((Date.now() - startTimes.get(i)) / 1000);
          spinner.suffixText = chalk.dim(`${s}s`);
        }
      }
    }, 1000);

    await batchAsk(items, {
      maxTokens: 2000,
      cwd,
      onItemDone: (label, result, i, err) => {
        const spinner = spinners.get(i);
        if (err) {
          spinner.fail(`  [${i + 1}/${items.length}] ${chalk.blue(label)} ${chalk.red('failed')}`);
          console.error(chalk.dim(`    ${err.message}`));
        } else {
          const mapDir = path.join(cwd, 'specs', '_map');
          fs.mkdirSync(mapDir, { recursive: true });
          const slugLabel = label === 'root' ? 'root' : label.replace(/[/\\]+/g, '-').toLowerCase();
          fs.writeFileSync(path.join(mapDir, `${slugLabel}.spec.md`), result, 'utf-8');

          const elapsed = Math.floor((Date.now() - startTimes.get(i)) / 1000);
          spinner.succeed(`  [${i + 1}/${items.length}] ${chalk.blue(label)} ${chalk.green('updated')} ${chalk.dim(`${elapsed}s`)}`);
        }
      },
    });

    clearInterval(heartbeat);
  }

  console.log(chalk.dim(`\n  Module specs: specs/_map/*.spec.md\n`));
}

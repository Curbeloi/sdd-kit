/**
 * sdd spec execute — execute a spec task via Claude Code
 */

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { readSpec, findNextPendingTask, readModuleSpecs } from '../../core/spec-reader.js';
import { generateExecutePrompt, executeTask, detectMode, Mode } from '../../core/generator.js';
import { createProgress } from '../../core/progress.js';
import { refreshModule } from './refresh.js';
import { refreshSteering } from '../init.js';

export async function executeCmd({ specName, taskId, dryRun, promptOnly, cwd = process.cwd() }) {
  const spec = readSpec(cwd, specName);
  if (!spec) {
    console.error(chalk.red(`\n  Spec not found: ${specName}`));
    console.log(chalk.dim(`  Expected: specs/features/${specName}/tasks.md\n`));
    return;
  }

  let task;
  if (taskId) {
    task = spec.tasks.find(t => t.id === taskId);
    if (!task) {
      console.error(chalk.red(`\n  Task ${taskId} not found in ${specName}`));
      const ids = spec.tasks.map(t => t.id).join(', ');
      if (ids) console.log(chalk.dim(`  Available tasks: ${ids}`));
      console.log('');
      return;
    }
  } else {
    task = findNextPendingTask(spec.tasks);
    if (!task) {
      console.log(chalk.green(`\n  All tasks complete in ${specName}!\n`));
      return;
    }
  }

  const modules = readModuleSpecs(cwd);
  const moduleContext = Object.entries(modules).map(([name, content]) =>
    `### Module: ${name}\n${content}`
  ).join('\n\n');

  const prompt = generateExecutePrompt({
    spec,
    task,
    requirements: spec.files.requirements,
    design: spec.files.design,
    moduleContext,
  });

  if (dryRun) {
    console.log(`\n${chalk.bold('Would execute:')} ${chalk.cyan(task.id)} — ${task.desc}`);
    if (task.file) console.log(chalk.dim(`  File: ${task.file}`));
    console.log('');
    return;
  }

  const mode = await detectMode(promptOnly);

  console.log(`\n${chalk.bold('sdd spec execute')} — ${chalk.cyan(specName)} task ${task.id}\n`);

  if (mode === Mode.CLAUDE) {
    const spinner = ora(`Executing task ${task.id} via Claude Code...`).start();
    const onProgress = createProgress(spinner);
    try {
      await executeTask({ prompt, cwd, onProgress });
      spinner.succeed(`Task ${task.id} executed by Claude Code`);
      console.log(chalk.dim(`  Check specs/features/${specName}/tasks.md for updated status.`));

      // Post-task: refresh module spec for affected directory
      if (task.file) {
        const dir = path.dirname(task.file).split(path.sep)[0];
        if (dir && dir !== '.') {
          const refreshSpinner = ora(chalk.dim(`Updating module spec: ${dir}`)).start();
          try {
            await refreshModule({ dir: task.file.split(path.sep).slice(0, -1).join(path.sep) || '.', cwd });
            refreshSpinner.succeed(chalk.dim(`Module spec updated: ${dir}`));
          } catch {
            refreshSpinner.info(chalk.dim(`Module spec not updated (run sdd spec refresh)`));
          }
        }
      }
      // Auto-refresh steering docs
      await refreshSteering({ cwd, silent: false });
    } catch (err) {
      onProgress.stop();
      spinner.fail(`Task ${task.id} failed`);
      console.error(chalk.red(`\n  ${err.message}`));
    }
  } else {
    // Fallback: save prompt to file
    const promptDir = path.join(cwd, 'specs', 'features', specName);
    fs.mkdirSync(promptDir, { recursive: true });
    const promptPath = path.join(promptDir, `execute_${task.id}_prompt.md`);
    fs.writeFileSync(promptPath, prompt, 'utf-8');
    console.log(chalk.dim('─'.repeat(60)));
    console.log(prompt);
    console.log(chalk.dim('─'.repeat(60)));
    console.log(`\n  ${chalk.dim('Prompt saved:')} ${path.relative(cwd, promptPath)}`);
    console.log(chalk.dim(`  Paste into Claude Code to execute this task.`));
  }
  console.log('');
}

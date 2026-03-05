/**
 * sdd spec execute — generate Claude Code prompt for a spec's tasks
 */

import chalk from 'chalk';
import { readSpec, findNextPendingTask } from '../../core/spec-reader.js';
import { generateExecutePrompt } from '../../core/generator.js';

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

  if (dryRun) {
    console.log(`\n${chalk.bold('Would execute:')} ${chalk.cyan(task.id)} — ${task.desc}`);
    if (task.file) console.log(chalk.dim(`  File: ${task.file}`));
    console.log('');
    return;
  }

  const prompt = generateExecutePrompt({
    spec,
    task,
    requirements: spec.files.requirements,
    design: spec.files.design,
  });

  console.log(`\n${chalk.bold('sdd spec execute')} — ${chalk.cyan(specName)} task ${task.id}\n`);
  console.log(chalk.dim('─'.repeat(60)));
  console.log(prompt);
  console.log(chalk.dim('─'.repeat(60)));
  console.log(`\n${chalk.dim('Copy the above prompt into Claude Code to execute this task.')}\n`);
}

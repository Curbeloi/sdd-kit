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
import { snapshotBefore, getChangedSince, getAffectedModuleDirs } from '../../core/git-changes.js';

export async function executeCmd({ specName, taskId, dryRun, promptOnly, refreshMode = 'structural', cwd = process.cwd() }) {
  const spec = readSpec(cwd, specName);
  if (!spec) {
    console.error(chalk.red(`\n  Spec not found: ${specName}`));
    console.log(chalk.dim(`  Run \`sdd spec list\` to see available specs.\n`));
    process.exitCode = 1;
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
    // Snapshot git state before execution
    const snapshot = snapshotBefore(cwd);

    const spinner = ora(`Executing task ${task.id} via Claude Code...`).start();
    const onProgress = createProgress(spinner);
    try {
      await executeTask({ prompt, cwd, onProgress });
      spinner.succeed(`Task ${task.id} executed by Claude Code`);
      console.log(chalk.dim(`  Check ${path.relative(cwd, spec.dir)}/tasks.md for updated status.`));

      // Post-task: detect what actually changed via git diff
      const changes = getChangedSince(snapshot, cwd);

      if (refreshMode === 'off') {
        console.log(chalk.dim(`\n  Skipped auto-refresh (--refresh=off).`));
      } else if (changes.files.length > 0) {
        const affectedDirs = getAffectedModuleDirs(changes.files);
        // Filter to dirs that aren't specs/node_modules/etc.
        const moduleDirs = affectedDirs.filter(d =>
          d !== '.' && !d.startsWith('specs') && !d.startsWith('node_modules') && !d.startsWith('.claude')
        );

        const shouldRefreshModules =
          refreshMode === 'auto' ||
          (refreshMode === 'structural' && changes.hasStructuralChange);

        if (moduleDirs.length > 0 && shouldRefreshModules) {
          console.log(chalk.dim(`\n  Detected changes in ${changes.files.length} file(s) across ${moduleDirs.length} module(s)`));

          for (const dir of moduleDirs) {
            const refreshSpinner = ora(chalk.dim(`  Updating module spec: ${dir}`)).start();
            try {
              await refreshModule({ dir, cwd });
              refreshSpinner.succeed(chalk.dim(`  Module spec updated: ${dir}`));
            } catch {
              refreshSpinner.info(chalk.dim(`  Module spec not updated: ${dir} (run sdd spec refresh)`));
            }
          }
        } else if (moduleDirs.length > 0) {
          console.log(chalk.dim(`\n  ${moduleDirs.length} module(s) changed but no structural changes detected — skipping auto-refresh. Use --refresh=auto or run \`sdd spec refresh\` to force.`));
        }

        // Auto-refresh steering docs — flag structural changes
        await refreshSteering({
          cwd,
          silent: false,
          structuralChange: changes.hasStructuralChange,
        });
      } else {
        // No git changes detected, still try steering refresh
        await refreshSteering({ cwd, silent: false });
      }
    } catch (err) {
      onProgress.stop();
      spinner.fail(`Task ${task.id} failed`);
      console.error(chalk.red(`\n  ${err.message}`));
      process.exitCode = 1;
    }
  } else {
    // Fallback: save prompt into the spec's own directory (wherever it lives).
    const promptDir = spec.dir;
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

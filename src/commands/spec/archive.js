/**
 * sdd spec archive — move specs to/from the archived directory.
 *
 * Feature specs accumulate forever: every fix, chore and experiment leaves one
 * behind, and they all get fed to `sdd arch`. Past a few hundred the corpus
 * stops fitting in a model context and arch degrades (or used to fail outright).
 * Archiving is the pressure valve — `specs/archived/` is already excluded from
 * every reader (see RESERVED_SPEC_DIRS in spec-reader.js), so moving a spec
 * there takes it out of arch and status without deleting anything.
 *
 * Single: sdd spec archive feat-jwt-auth
 * Bulk:   sdd spec archive --completed
 *         sdd spec archive --before 2026-01-01
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

  fs.mkdirSync(archivedDir, { recursive: true });
  fs.renameSync(src, dest);
  console.log(`\n${chalk.bold('sdd spec archive')} — ${chalk.cyan(specName)}`);
  console.log(chalk.green(`  Archived ${path.relative(cwd, src)}/ → specs/archived/${specName}/\n`));
}

function restoreSpec({ specName, archivedDir, cwd }) {
  // Restore from archived → route back to the type folder its name implies.
  const src = path.join(archivedDir, specName);
  const dest = specDestDir(cwd, specName);

  if (!fs.existsSync(src)) {
    console.error(chalk.red(`\n  Archived spec not found: ${specName}`));
    console.log(chalk.dim(`  Expected: specs/archived/${specName}/\n`));
    process.exitCode = 1;
    return;
  }

  if (fs.existsSync(dest)) {
    console.error(chalk.red(`\n  Spec already exists: ${specName}`));
    console.log(chalk.dim(`  Delete or rename the existing spec first.\n`));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  console.log(`\n${chalk.bold('sdd spec archive --restore')} — ${chalk.cyan(specName)}`);
  console.log(chalk.green(`  Restored specs/archived/${specName}/ → ${path.relative(cwd, dest)}/\n`));
}

function archiveBulk({ completed, before, dryRun, archivedDir, cwd }) {
  const criteria = [
    completed && 'all tasks complete',
    before && `untouched since ${before.toISOString().slice(0, 10)}`,
  ].filter(Boolean).join(' + ');

  console.log(`\n${chalk.bold('sdd spec archive')} — ${chalk.cyan(criteria)}${dryRun ? chalk.dim(' (dry run)') : ''}`);

  const all = readAllSpecs(cwd);
  const matches = selectForArchive(all, { completed, before });

  if (!matches.length) {
    console.log(chalk.dim(`\n  No specs match (${all.length} spec(s) scanned).\n`));
    return;
  }

  if (dryRun) {
    console.log(chalk.dim(`\n  Would archive ${matches.length} of ${all.length} spec(s):`));
    for (const spec of matches) console.log(`  ${chalk.yellow('-')} ${spec.name}`);
    console.log(chalk.dim('\n  Re-run without --dry-run to apply.\n'));
    return;
  }

  fs.mkdirSync(archivedDir, { recursive: true });
  let moved = 0;
  const failed = [];

  for (const spec of matches) {
    const dest = path.join(archivedDir, spec.name);
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
  }

    fs.mkdirSync(archivedDir, { recursive: true });
    fs.renameSync(src, dest);
    console.log(`\n${chalk.bold('sdd spec archive')} — ${chalk.cyan(specName)}`);
    console.log(chalk.green(`  Archived ${path.relative(cwd, src)}/ → specs/archived/${specName}/\n`));
  }
  console.log(chalk.dim('  Archived specs are excluded from `sdd arch` and `sdd spec status`.'));
  console.log(chalk.dim('  Restore one with `sdd spec archive <name> --restore`.\n'));
}

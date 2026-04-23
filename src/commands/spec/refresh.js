/**
 * sdd spec refresh — update module specs (living documentation)
 *
 * Uses unified claude-api (SDK or CLI auto-detected).
 * Skips modules whose content-hash matches the stored frontmatter (see hash-cache.js)
 * unless `--force` is passed.
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { scanTree, groupByDirectory, readGroupFiles, buildGroupPrompt, buildGroupPromptSymbols } from '../../core/scanner.js';
import { askClaude, getEngineName, batchAsk } from '../../core/claude-api.js';
import { loadCache, saveCache, computeGroupHash } from '../../core/hash-cache.js';
import { parseFrontmatter, stringifyFrontmatter } from '../../core/spec-reader.js';

function slugify(label) {
  return label === 'root' ? 'root' : label.replace(/[/\\]+/g, '-').toLowerCase();
}

function readStoredHash(specPath) {
  if (!fs.existsSync(specPath)) return null;
  try {
    const existing = fs.readFileSync(specPath, 'utf-8');
    const { frontmatter } = parseFrontmatter(existing);
    return frontmatter && frontmatter.source_hash ? frontmatter.source_hash : null;
  } catch {
    return null;
  }
}

function writeSpecWithFrontmatter(specPath, body, groupHash) {
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  const fm = {
    source_hash: groupHash,
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(specPath, stringifyFrontmatter(fm, body), 'utf-8');
}

function buildPromptForGroup(label, fileContents, deep) {
  return deep
    ? buildGroupPrompt(label, fileContents)
    : buildGroupPromptSymbols(label, fileContents);
}

/**
 * Refresh a single module spec. Used by execute.js post-task and by CLI command.
 * Returns { skipped: boolean, specPath?: string }.
 *
 * `deep=false` (default) sends per-file symbol summaries — cheap.
 * `deep=true` sends truncated file contents — the old behavior, higher fidelity.
 */
export async function refreshModule({ dir, cwd, maxTokens = 1000, force = false, deep = false }) {
  const resolvedDir = path.resolve(cwd, dir);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    return { skipped: true };
  }

  const tree = scanTree(resolvedDir);
  if (tree.files.length === 0) return { skipped: true };

  const groups = groupByDirectory(tree);
  const relPathsFromCwd = tree.files.map(f =>
    path.relative(cwd, path.join(resolvedDir, f.rel))
  );

  const cache = loadCache(cwd);
  const groupHash = computeGroupHash(cache, cwd, relPathsFromCwd);

  const label = slugify(dir.replace(/[/\\]+/g, '-').toLowerCase() || 'root');
  const mapDir = path.join(cwd, 'specs', '_map');
  const specPath = path.join(mapDir, `${label}.spec.md`);

  if (!force && readStoredHash(specPath) === groupHash) {
    saveCache(cwd, cache); // persist any refreshed mtime entries
    return { skipped: true, specPath };
  }

  const allFiles = [];
  for (const group of groups) {
    allFiles.push(...readGroupFiles(resolvedDir, group));
  }

  const prompt = buildPromptForGroup(label, allFiles, deep);
  const analysis = await askClaude(prompt, { maxTokens, cwd });

  writeSpecWithFrontmatter(specPath, analysis, groupHash);
  saveCache(cwd, cache);
  return { skipped: false, specPath };
}

/**
 * CLI command: sdd spec refresh [dir]
 */
export async function refreshCmd({ dir, promptOnly, verbose = false, force = false, deep = false, cwd = process.cwd() }) {
  const maxTokens = verbose ? 2000 : 1000;
  const modeLabel = deep ? 'deep' : 'symbols';
  console.log(`\n${chalk.bold('sdd spec refresh')} — ${chalk.cyan('update module specs')}`);
  console.log(chalk.dim(`  Engine: ${getEngineName()}  |  max_tokens: ${maxTokens}${verbose ? ' (verbose)' : ''}  |  mode: ${modeLabel}${force ? '  |  force: on' : ''}\n`));

  if (promptOnly) {
    console.log(chalk.yellow('  Module refresh requires an engine (API key or Claude Code CLI).\n'));
    return;
  }

  if (dir) {
    const spinner = ora(`Refreshing module spec: ${dir}`).start();
    try {
      const result = await refreshModule({ dir, cwd, maxTokens, force, deep });
      if (result.skipped) {
        spinner.info(chalk.dim(`Module spec unchanged: ${dir} (skipped)`));
      } else {
        spinner.succeed(`Module spec updated: ${dir}`);
      }
    } catch (err) {
      spinner.fail(`Failed to refresh ${dir}`);
      console.error(chalk.red(`  ${err.message}`));
    }
    console.log(chalk.dim(`\n  Module specs: specs/_map/*.spec.md\n`));
    return;
  }

  // Bulk path: refresh all groups
  const tree = scanTree(cwd);
  const groups = groupByDirectory(tree);

  if (groups.length === 0) {
    console.log(chalk.yellow('  No source files found.\n'));
    return;
  }

  const cache = loadCache(cwd);
  const mapDir = path.join(cwd, 'specs', '_map');

  // Pre-compute hashes, filter skipped groups
  const pending = [];
  const skipped = [];
  for (const group of groups) {
    const label = group.dir === '.' ? 'root' : group.dir;
    const slug = slugify(label);
    const specPath = path.join(mapDir, `${slug}.spec.md`);
    const relPaths = group.files.map(f => f.rel);
    const groupHash = computeGroupHash(cache, cwd, relPaths);

    if (!force && readStoredHash(specPath) === groupHash) {
      skipped.push({ label });
      continue;
    }

    const fileContents = readGroupFiles(cwd, group);
    const prompt = buildPromptForGroup(label, fileContents, deep);
    pending.push({ prompt, label, specPath, groupHash });
  }

  // Persist cache early — any new mtime entries from the scan are already valid.
  saveCache(cwd, cache);

  if (skipped.length > 0) {
    console.log(chalk.dim(`  ${skipped.length} group(s) unchanged — skipping: ${skipped.map(s => s.label).join(', ')}`));
  }

  if (pending.length === 0) {
    console.log(chalk.green(`\n  All ${groups.length} module(s) up to date. Use --force to regenerate.\n`));
    return;
  }

  console.log(chalk.dim(`  ${pending.length} group(s) to refresh\n`));

  const spinners = new Map();
  const startTimes = new Map();

  for (let i = 0; i < pending.length; i++) {
    const spinner = ora(`  [${i + 1}/${pending.length}] ${chalk.blue(pending[i].label)} — waiting...`).start();
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

  await batchAsk(
    pending.map(p => ({ prompt: p.prompt, label: p.label })),
    {
      maxTokens,
      cwd,
      onItemDone: (label, result, i, err) => {
        const spinner = spinners.get(i);
        if (err) {
          spinner.fail(`  [${i + 1}/${pending.length}] ${chalk.blue(label)} ${chalk.red('failed')}`);
          console.error(chalk.dim(`    ${err.message}`));
          return;
        }
        writeSpecWithFrontmatter(pending[i].specPath, result, pending[i].groupHash);
        const elapsed = Math.floor((Date.now() - startTimes.get(i)) / 1000);
        spinner.succeed(`  [${i + 1}/${pending.length}] ${chalk.blue(label)} ${chalk.green('updated')} ${chalk.dim(`${elapsed}s`)}`);
      },
    },
  );

  clearInterval(heartbeat);

  console.log(chalk.dim(`\n  Module specs: specs/_map/*.spec.md\n`));
}

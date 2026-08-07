/**
 * sdd spec document — reverse engineer existing code into a spec
 *
 * Uses unified claude-api (SDK or CLI auto-detected):
 *   1. Scan locally → show plan
 *   2. Read files locally
 *   3. Parallel analysis — one request per directory → specs/_map/*.spec.md
 *   4. Final synthesis → unified spec
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { scanTree, groupByDirectory, printPlan, readGroupFiles, buildGroupPrompt, buildSynthesisPrompt } from '../../core/scanner.js';
import { detectEngine, getEngineName, batchAsk, askClaude } from '../../core/claude-api.js';
import { refreshSteering } from '../init.js';

export async function documentCmd({ source, name, promptOnly, cwd = process.cwd() }) {
  const resolvedSource = path.resolve(cwd, source);

  if (!fs.existsSync(resolvedSource)) {
    console.error(chalk.red(`\n  Path not found: ${source}\n`));
    return;
  }

  const specName = name || slugify(source);
  const isDir = fs.statSync(resolvedSource).isDirectory();

  console.log(`\n${chalk.bold('sdd spec document')} — ${chalk.cyan(specName)}`);
  console.log(chalk.dim(`  Source: ${source} (${isDir ? 'directory' : 'file'})\n`));

  // ─── Phase 1: Scan (instant) ──────────────────────────────────
  const spinnerScan = ora('Scanning...').start();
  const tree = scanTree(resolvedSource);
  const groups = groupByDirectory(tree);
  spinnerScan.succeed(`Found ${tree.files.length} files in ${groups.length} groups`);
  console.log('');

  printPlan(groups, tree.files.length);

  if (tree.files.length === 0) {
    console.log(chalk.yellow('  No source files found.\n'));
    return;
  }

  if (promptOnly) {
    return savePromptOnly({ groups, resolvedSource, specName, cwd });
  }

  const engine = detectEngine();
  console.log(chalk.dim(`  Engine: ${getEngineName()}\n`));

  // ─── Phase 2: Parallel per-directory analysis ─────────────────
  console.log(chalk.bold('  Analyzing directories:\n'));

  // Read files locally + build prompts
  const items = groups.map(group => {
    const label = group.dir === '.' ? 'root' : group.dir;
    const fileContents = readGroupFiles(resolvedSource, group);
    const prompt = buildGroupPrompt(label, fileContents);
    return { prompt, label };
  });

  // Spinners for each item
  const spinners = new Map();
  const startTimes = new Map();

  for (let i = 0; i < items.length; i++) {
    const prefix = chalk.dim(`  [${i + 1}/${items.length}]`);
    const spinner = ora(`${prefix} ${chalk.blue(items[i].label)} — waiting...`).start();
    spinners.set(i, spinner);
    startTimes.set(i, Date.now());
  }

  // Heartbeat. unref + finally: a cosmetic interval must never be the reason
  // the process outlives its own output (the `sdd arch` hang was exactly this).
  const heartbeat = setInterval(() => {
    for (const [i, spinner] of spinners) {
      if (spinner.isSpinning) {
        const s = Math.floor((Date.now() - startTimes.get(i)) / 1000);
        spinner.suffixText = chalk.dim(`${s}s`);
      }
    }
  }, 1000);
  heartbeat.unref();

  let results;
  try {
    results = await batchAsk(items, {
      maxTokens: 2000,
      cwd,
      onItemDone: (label, result, i, err) => {
        const prefix = chalk.dim(`  [${i + 1}/${items.length}]`);
        const spinner = spinners.get(i);

        if (err) {
          spinner.fail(`${prefix} ${chalk.blue(label)} ${chalk.red('failed')}`);
          console.error(chalk.dim(`      ${err.message}`));
        } else {
          // Save module spec
          const mapDir = path.join(cwd, 'specs', '_map');
          fs.mkdirSync(mapDir, { recursive: true });
          const specPath = path.join(mapDir, `${slugifyDir(label)}.spec.md`);
          fs.writeFileSync(specPath, result, 'utf-8');

          const elapsed = Math.floor((Date.now() - startTimes.get(i)) / 1000);
          spinner.succeed(`${prefix} ${chalk.blue(label)} ${chalk.green('done')} ${chalk.dim(`${elapsed}s → _map/${slugifyDir(label)}.spec.md`)}`);
        }
      },
    });
  } finally {
    clearInterval(heartbeat);
    // A spinner left spinning owns an interval of its own.
    for (const spinner of spinners.values()) if (spinner.isSpinning) spinner.stop();
  }

  console.log('');

  // Build partial specs for synthesis
  const partialSpecs = results.map(r =>
    r.result
      ? { dir: r.label, content: r.result }
      : { dir: r.label, content: `# ${r.label}\n\n(analysis failed)\n` }
  );

  // ─── Phase 3: Synthesize unified spec ─────────────────────────
  const synthPrompt = buildSynthesisPrompt(specName, source, partialSpecs);
  const spinnerSynth = ora('Synthesizing unified spec...').start();
  const synthStart = Date.now();
  const synthHeartbeat = setInterval(() => {
    const s = Math.floor((Date.now() - synthStart) / 1000);
    spinnerSynth.suffixText = chalk.dim(`${s}s`);
  }, 1000);
  synthHeartbeat.unref();

  try {
    const unified = await askClaude(
      synthPrompt + '\n\nReturn ONLY the markdown content for the spec file. No explanation.',
      { maxTokens: 4000, cwd }
    );

    const specsDir = path.join(cwd, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    const specPath = path.join(specsDir, `${specName}.spec.md`);
    fs.writeFileSync(specPath, unified, 'utf-8');

    const elapsed = Math.floor((Date.now() - synthStart) / 1000);
    spinnerSynth.succeed(`Unified spec created ${chalk.dim(`${elapsed}s`)}`);
    console.log(`  ${chalk.green('created')} specs/${specName}.spec.md`);

    // Auto-refresh steering docs
    await refreshSteering({ cwd, silent: false });
  } catch (err) {
    spinnerSynth.fail('Synthesis failed');
    console.error(chalk.red(`  ${err.message}`));

    const specsDir = path.join(cwd, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    const promptPath = path.join(specsDir, `${specName}_synthesis_prompt.md`);
    fs.writeFileSync(promptPath, synthPrompt, 'utf-8');
    console.log(chalk.dim(`  Prompt saved: ${path.relative(cwd, promptPath)}`));
    process.exitCode = 1;
  } finally {
    // One place clears it, on every path — including the `refreshSteering`
    // call above, which could throw after the spec was already written.
    clearInterval(synthHeartbeat);
    if (spinnerSynth.isSpinning) spinnerSynth.stop();
  }

  console.log('');
}

// ─── Prompt-only fallback ─────────────────────────────────────────────────

function savePromptOnly({ groups, resolvedSource, specName, cwd }) {
  const partialSpecs = groups.map(group => {
    const label = group.dir === '.' ? 'root' : group.dir;
    const fileContents = readGroupFiles(resolvedSource, group);
    const fileList = fileContents.map(f => `- \`${f.path}\``).join('\n');
    return { dir: label, content: `# ${label}\n\n## Files\n${fileList}\n` };
  });

  const synthPrompt = buildSynthesisPrompt(specName, resolvedSource, partialSpecs);
  const specsDir = path.join(cwd, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  const promptPath = path.join(specsDir, `${specName}_document_prompt.md`);
  fs.writeFileSync(promptPath, synthPrompt, 'utf-8');
  console.log(chalk.dim(`  Prompt saved: ${path.relative(cwd, promptPath)}`));
  console.log(chalk.dim(`  Paste into Claude Code to generate the spec.\n`));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function slugify(s) {
  return path.basename(s)
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function slugifyDir(s) {
  return s === '.' ? 'root' : s.replace(/[/\\]+/g, '-').toLowerCase();
}

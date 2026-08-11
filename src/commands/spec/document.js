/**
 * sdd spec document — reverse engineer existing code into a spec
 *
 * Uses unified claude-api (SDK or CLI auto-detected):
 *   1. Scan locally → show plan
 *   2. Read files locally
 *   3. Parallel analysis — one request per directory, kept in memory
 *   4. Final synthesis → specs/<type>/<name>/design.md
 *
 * The per-directory analyses are NOT written to `specs/_map/`. They are grouped
 * relative to the *target*, while `spec refresh` names map specs relative to the
 * *project root* and stamps them with a `source_hash`. Writing them here meant
 * `sdd spec document app/agents/_common` clobbered the project's real
 * `specs/_map/root.spec.md` with a spec about five unrelated files. `spec refresh`
 * owns that directory; this command is a reader of code, not a map maintainer.
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { scanTree, groupByDirectory, printPlan, readGroupFiles, buildGroupPrompt, buildSynthesisPrompt, buildDirectSpecPrompt } from '../../core/scanner.js';
import { detectEngine, getEngineName, batchAsk, askClaude } from '../../core/claude-api.js';
import { specDestDir } from '../../core/spec-reader.js';
import { refreshSteering } from '../init.js';

/**
 * `api` exists so the two model calls can be stubbed in tests. The interesting
 * failure modes of this command — what it writes and where — only occur on the
 * path that talks to a model, so without a seam they cannot be covered at all.
 */
export async function documentCmd({
  source,
  name,
  promptOnly,
  cwd = process.cwd(),
  api = { batchAsk, askClaude, detectEngine, getEngineName },
}) {
  const resolvedSource = path.resolve(cwd, source);

  if (!fs.existsSync(resolvedSource)) {
    console.error(chalk.red(`\n  Path not found: ${source}\n`));
    process.exitCode = 1;
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

  const engine = api.detectEngine();
  console.log(chalk.dim(`  Engine: ${api.getEngineName()}\n`));

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
    results = await api.batchAsk(items, {
      maxTokens: 2000,
      cwd,
      onItemDone: (label, result, i, err) => {
        const prefix = chalk.dim(`  [${i + 1}/${items.length}]`);
        const spinner = spinners.get(i);

        if (err) {
          spinner.fail(`${prefix} ${chalk.blue(label)} ${chalk.red('failed')}`);
          console.error(chalk.dim(`      ${err.message}`));
          process.exitCode = 1;   // a partial analysis is not a success
        } else {
          // Held in memory for synthesis only — see the header note on why this
          // must not touch specs/_map/.
          const elapsed = Math.floor((Date.now() - startTimes.get(i)) / 1000);
          spinner.succeed(`${prefix} ${chalk.blue(label)} ${chalk.green('done')} ${chalk.dim(`${elapsed}s`)}`);
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
    const unified = await api.askClaude(
      synthPrompt + '\n\nReturn ONLY the markdown content for the spec file. No explanation.',
      { maxTokens: 4000, cwd }
    );

    // Into the spec's own directory, as design.md. A loose specs/<name>.spec.md
    // is read by nothing: readAllSpecs enumerates spec *directories* and skips
    // reserved ones, so the old path produced an orphan on every run.
    const destDir = specDestDir(cwd, specName);
    fs.mkdirSync(destDir, { recursive: true });
    const specPath = path.join(destDir, 'design.md');
    fs.writeFileSync(specPath, unified, 'utf-8');

    const elapsed = Math.floor((Date.now() - synthStart) / 1000);
    spinnerSynth.succeed(`Unified spec created ${chalk.dim(`${elapsed}s`)}`);
    console.log(`  ${chalk.green('created')} ${path.relative(cwd, specPath)}`);

    // Auto-refresh steering docs
    await refreshSteering({ cwd, silent: false });
  } catch (err) {
    spinnerSynth.fail('Synthesis failed');
    console.error(chalk.red(`  ${err.message}`));

    const destDir = specDestDir(cwd, specName);
    fs.mkdirSync(destDir, { recursive: true });
    const promptPath = path.join(destDir, 'synthesis_prompt.md');
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
  // No analysis pass runs on this path, so the synthesis prompt is the wrong
  // shape: it opens by asserting the directories were already analyzed, and the
  // only thing available to fill it with is a file list. That combination told
  // the model its analysis was done while handing it nothing but filenames.
  // buildDirectSpecPrompt says the opposite out loud: read these files first.
  const filePaths = groups.flatMap(group => group.files.map(f => f.rel));

  const prompt = buildDirectSpecPrompt(specName, resolvedSource, filePaths);
  const destDir = specDestDir(cwd, specName);
  fs.mkdirSync(destDir, { recursive: true });
  const promptPath = path.join(destDir, 'document_prompt.md');
  fs.writeFileSync(promptPath, prompt, 'utf-8');
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

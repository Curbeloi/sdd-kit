# core

## Purpose
The `core` directory is the engine layer of the `sdd-kit` tool — a spec-driven development CLI. It provides Claude AI integration (via SDK or CLI subprocess), spec file I/O, directory scanning for reverse-engineering code into specs, git change detection for living-doc refresh, and live progress display for long-running Claude operations.

## Key Components
- `claude-api.js` — Unified Claude client; auto-selects SDK (fast, parallel) or `claude` CLI subprocess (fallback), with batching support
- `generator.js` — Calls Claude Code CLI with `stream-json` output to generate SDD spec files (requirements, design, tasks); falls back to saving prompt files; contains size-aware prompt templates (small/medium/large)
- `git-changes.js` — Detects changed files via `git diff` before/after a task; powers living-doc refresh by identifying affected module directories
- `progress.js` — Creates an `ora`-spinner progress callback that shows elapsed time and active Claude tool calls (Read, Write, Edit, etc.) in real-time
- `scanner.js` — Walks a directory tree (respecting ignore lists), groups files, reads content, and builds batched analysis prompts for bottom-up code-to-spec generation
- `spec-reader.js` — Pure-function reader for all spec artifacts on disk: feature specs (`specs/features/`), module maps (`specs/_map/`), Claude steering files (`.claude/steering/`), and task parsing

## Exports / Public Interface
- `claude-api.js`: `detectEngine()`, `getEngineName()`, `askClaude(prompt, opts)`, `batchAsk(items, opts)`
- `generator.js`: `Mode`, `detectMode(promptOnly)`, `callClaude(prompt, opts)` *(internal)*, `SIZE_INSTRUCTIONS` prompt templates, `DOCUMENT_PROMPT`
- `git-changes.js`: `snapshotBefore(cwd)`, `getChangedSince(snapshot, cwd)`, `getAffectedModuleDirs(changedFiles)`
- `progress.js`: `createProgress(spinner)`
- `scanner.js`: `scanTree(rootPath)`, `groupByDirectory(tree)`, `printPlan(groups, total)`, `readGroupFiles(rootPath, group, onFile)`, `buildGroupPrompt(dirName, fileContents)`, `buildSynthesisPrompt(specName, sourcePath, partialSpecs)`
- `spec-reader.js`: `readAllSpecs(cwd)`, `readSpec(cwd, specName)`, `readModuleSpecs(cwd)`, `readSteering(cwd)`, `parseTasks(content)`, `findNextPendingTask(tasks)`

## Dependencies
- `@anthropic-ai/sdk` — SDK engine in `claude-api.js` (lazy-loaded)
- `claude` CLI binary — subprocess engine in `claude-api.js` and `generator.js`
- `chalk` — terminal coloring in `generator.js`, `progress.js`, `scanner.js`
- `child_process` (`spawn`, `execFile`, `execSync`) — for Claude subprocess calls and git commands
- `fs`, `path`, `util` — Node.js stdlib for file I/O, path resolution, promisification

## Notes
- Both `claude-api.js` and `generator.js` delete `process.env.CLAUDECODE` before spawning subprocesses to prevent Claude Code's nested-session block.
- `generator.js` uses `stream-json` output format to parse tool calls and text incrementally, while `claude-api.js` uses plain `text` format (simpler, no streaming needed).
- There is functional overlap between the two Claude callers — `generator.js`'s `callClaude` handles structured streaming with tool-use events; `claude-api.js`'s `askCli` is a simpler fire-and-forget wrapper.
- `spec-reader.js` is intentionally pure (no side effects), making it safe to call freely from any command.
- `generator.js` has a truncated `DOCUMENT_PROMPT` (ends mid-expression with `specs/${spe`) — this appears to be a bug.
# commands

## Purpose
CLI command handlers for the `sdd` (Spec-Driven Development) tool. Each file implements one subcommand, receiving parsed CLI args and orchestrating core modules to generate, execute, document, and track feature specs. Commands are thin orchestration layers — they handle UX (spinners, color output, progress) but delegate all AI and file logic to `core/`.

## Key Components
- `spec/create.js` — Generates spec files (requirements, design, tasks) from a natural language feature description using Claude Code or saves a prompt fallback
- `spec/document.js` — Reverse-engineers existing source code into module specs via parallel per-directory analysis, then synthesizes a unified spec
- `spec/execute.js` — Executes the next pending task in a spec via Claude Code; post-execution auto-refreshes affected module specs and steering docs using git diff
- `spec/refresh.js` — Updates `specs/_map/*.spec.md` living documentation for one or all directories; also exported as `refreshModule()` for programmatic use by `execute.js`
- `spec/status.js` — Reads all specs and renders a progress dashboard (progress bars, task checklists, file indicators) to the terminal; no AI calls
- `arch.js` — Reads all specs + steering + module specs, invokes Claude Code to generate `architecture.md`, then parses it into a Mermaid + HTML dashboard
- `init.js` — Scaffolds `.claude/steering/` and `specs/features/`; optionally auto-generates steering docs from existing module specs via Claude API; injects an SDD block into `CLAUDE.md`

## Exports / Public Interface
- `createCmd({ description, name, size, promptOnly, cwd })`
- `documentCmd({ source, name, promptOnly, cwd })`
- `executeCmd({ specName, taskId, dryRun, promptOnly, cwd })`
- `refreshCmd({ dir, promptOnly, cwd })` + `refreshModule({ dir, cwd })` (programmatic)
- `statusCmd({ specName, verbose, cwd })`
- `archCmd({ level, flow, output, promptOnly, cwd })`
- `initCmd({ auto, cwd })` + `refreshSteering({ cwd, silent, structuralChange })`

## Dependencies
- `core/generator.js` — `generateCreateSpec`, `generateExecutePrompt`, `executeTask`, `generateArchitecture`, `detectMode`, `Mode`
- `core/spec-reader.js` — `readSpec`, `readAllSpecs`, `readSteering`, `readModuleSpecs`
- `core/claude-api.js` — `askClaude`, `batchAsk`, `detectEngine`, `getEngineName`
- `core/scanner.js` — `scanTree`, `groupByDirectory`, `readGroupFiles`, `buildGroupPrompt`, `buildSynthesisPrompt`
- `core/git-changes.js` — `snapshotBefore`, `getChangedSince`, `getAffectedModuleDirs`
- `core/progress.js` — `createProgress`
- `chalk`, `ora` for terminal UX

## Notes
- **`promptOnly` fallback**: every AI-dependent command degrades gracefully — if Claude Code/API is unavailable, a markdown prompt file is saved for manual use
- **Living docs loop**: `execute.js` uses git diff post-task to detect which module directories changed and triggers targeted `refreshModule()` calls, keeping `specs/_map/` in sync automatically
- **`refreshModule` dual role**: exported for programmatic use by `execute.js` and also exposed as the `sdd spec refresh` CLI command — same function serves both
- **`init.js` owns steering refresh**: `refreshSteering` is exported from `init.js` and called by `create.js`, `document.js`, and `execute.js` after any spec-modifying operation
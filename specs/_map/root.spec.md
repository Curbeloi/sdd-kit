# root

## Purpose
Entry point and CLI definition for sdd-kit, a Spec-Driven Development tool for Claude Code. Parses arguments, routes subcommands, and provides bilingual (EN/ES) help text based on environment locale.

## Key Components
- `program` — Commander.js root program (`sdd`), version 0.3.0, with custom help layout that flattens subcommand trees
- `t` — Locale object selected at startup via `SDD_LANG`/`LANG` env vars; drives all user-facing strings
- `spec` subcommand group — parent for `create`, `document`, `execute`, `status`, `refresh`
- `arch` command — architecture view generation
- `init` command — lazy-loaded project initialization

## Exports / Public Interface
None — this is the CLI entrypoint (`bin`). It delegates all logic to imported command modules.

## Dependencies
- `commander` — argument parsing and help system
- `chalk` — terminal color formatting
- `./commands/spec/create.js` — `createCmd`
- `./commands/spec/document.js` — `documentCmd`
- `./commands/spec/status.js` — `statusCmd`
- `./commands/spec/execute.js` — `executeCmd`
- `./commands/spec/refresh.js` — `refreshCmd`
- `./commands/arch.js` — `archCmd`
- `./commands/init.js` — `initCmd` (dynamically imported)

## Notes
- `configureHelp.visibleCommands` flattens nested `spec *` commands so they appear at the top level in `--help` output, with names prefixed (e.g. `spec create`).
- `init.js` is the only lazy import, avoiding load cost unless the subcommand is used.
- Locale detection is coarse (`startsWith('es')`); any non-Spanish locale falls back to English.
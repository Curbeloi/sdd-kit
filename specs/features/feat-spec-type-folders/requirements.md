# Requirements: feat-spec-type-folders

> Roadmap item 2. Route specs into type subdirectories (`features/`, `bugfix/`, `chore/`, …) derived from the name prefix, and make every spec command discover specs across all of them. Fully backward-compatible with the current `specs/features/` layout.

## User stories

- As a user, `sdd spec create "..." --name fix-x -1` lands in `specs/bugfix/fix-x/`, while `feat-*` stays in `specs/features/` exactly as today.
- As a user, `sdd spec list/status` and `sdd arch` show specs from every type folder.
- As a user, `sdd spec execute/delete/rename/archive <name>` finds the spec wherever it lives.

## Acceptance criteria

1. Prefix → subdir map (siblings under the specs root = `dirname(specsDir)`):
   `feat→features, fix→bugfix, bug→bugfix, bugfix→bugfix, hotfix→hotfix, chore→chore, refactor→refactor, docs→docs, doc→docs, perf→perf, test→test`.
   Unknown prefix → default `specsDir` (features).
2. `specDestDir(cwd, name)` returns the routed creation path. `feat-*` resolves to the unchanged `specs/features/<name>`.
3. `specTypeDirs(cwd)` lists existing type dirs under the specs root, skipping reserved (`_map`, `_arch`, `archived`, any `_*`).
4. `resolveSpecDir(cwd, name)` finds an existing spec across all type dirs (null if none).
5. `readAllSpecs` aggregates across all type dirs; `readSpec` resolves across them. Empty/strays excluded.
6. `create`, `list`, `status`, `execute` (prompt fallback path), `delete`, `rename`, `archive` all use the resolver / `spec.dir` — no hardcoded `specs/features/<name>`.
7. `rename` keeps the spec in its current type dir; `archive --restore` routes back via `specDestDir`.
8. Back-compat: a repo with only `specs/features/*` behaves identically. Bare `specs_dir` (no parent) falls back to single-dir (old) behavior.

## Risk

Cross-cutting (touches spec-reader + 6 commands). Centralize resolution in `spec-reader.js`; cover with unit tests before wiring commands.

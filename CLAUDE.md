# CLAUDE.md

<!-- sdd-kit:start -->
## SDD (Spec-Driven Development)

This project uses [sdd-kit](https://github.com/Curbeloi/sdd-kit). Specs drive code.

### Documentation
- `.claude/steering/` — project context (product, tech, structure)
- `specs/features/` — feature specs (requirements, design, tasks)
- `specs/_map/` — auto-generated module map (skipped when source is unchanged)
- `specs/_arch/` — architecture views

### Most-used commands
- `sdd spec create "feature"` — scaffold spec (default req + tasks; `-3` adds design)
- `sdd spec execute <name>` — run next task via Claude Code
- `sdd spec status` — progress overview
- `sdd spec refresh` — update module map (skips unchanged; `-f` force, `-d` deep)
- `sdd arch` — regenerate architecture views
- `sdd --help` — full reference

### Conventions
- Read relevant specs in `specs/features/` before implementing.
- Check `.claude/steering/` for project context.
- Completed tasks are auto-marked in `tasks.md`.
<!-- sdd-kit:end -->

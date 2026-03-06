# CLAUDE.md

<!-- sdd-kit:start -->
## SDD (Spec-Driven Development)

This project uses [sdd-kit](https://github.com/anthropics/sdd-kit) for spec-driven development.

### Documentation structure
- `.claude/steering/` — Project context (product, tech stack, structure)
- `specs/features/` — Feature specs (requirements, design, tasks)
- `specs/_map/` — Living project map (auto-generated)
- `specs/_arch/` — Architecture views and dashboard

### Key commands
- `sdd spec create "feature"` — Create a new feature spec
- `sdd spec execute <name>` — Execute next task from a spec
- `sdd spec status` — Show project progress
- `sdd arch` — Generate architecture dashboard

### When working on this project
- Read relevant specs in `specs/features/` before implementing features
- Check `.claude/steering/` for project context and conventions
- After completing tasks, they are auto-marked in `tasks.md`
<!-- sdd-kit:end -->

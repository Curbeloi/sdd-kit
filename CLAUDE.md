# CLAUDE.md

<!-- sdd-kit:start -->
## SDD (Spec-Driven Development)

This project uses [sdd-kit](https://github.com/Curbeloi/sdd-kit) for spec-driven development.

### Documentation structure
- `.claude/steering/` — Project context (product, tech stack, structure)
- `specs/features/` — Feature specs (requirements, design, tasks)
- `specs/_map/` — Living project map (auto-generated)
- `specs/_arch/` — Architecture views and dashboard

### Commands reference

#### Spec creation
- `sdd spec create "feature"` — Scaffold spec files (empty with header)
  - `-1` tasks.md only (bug fixes, tweaks)
  - `-2` requirements.md + tasks.md (clear features, 1-3 days)
  - `-3` full spec: requirements + design + tasks (default)
  - `-n, --name <name>` custom spec name
- `sdd spec create --name feat-my-feature` — Create without description

#### Spec execution
- `sdd spec execute <spec-name>` — Execute next pending task via Claude Code
  - `-t, --task <id>` execute a specific task (e.g. `--task 1.2`)
  - `--dry-run` preview what would be done without executing
  - `-p, --prompt-only` generate prompt without executing

#### Code documentation
- `sdd spec document <path>` — Reverse engineer existing code into a spec
  - `-n, --name <name>` custom spec name
  - `-p, --prompt-only` save prompt instead of invoking Claude Code

#### Project overview
- `sdd spec status` — Show project progress across all specs
  - `sdd spec status <spec-name> --verbose` — Show individual task details
- `sdd spec refresh` — Update project map specs (living documentation)
  - `sdd spec refresh <dir>` — Refresh a specific directory

#### Architecture
- `sdd arch` — Generate architecture views and dashboard
  - `-l, --level <level>` system | services | modules
  - `-f, --flow <feature>` show flow diagram for a specific feature

#### Setup
- `sdd init` — Initialize sdd-kit in project (creates steering docs + CLAUDE.md)
  - `--auto` auto-generate steering from map specs

### Workflow
1. `sdd init` — Set up project structure
2. `sdd spec document src/` — Map existing code into specs
3. `sdd spec create "feature"` — Plan a new feature
4. Fill the spec files with your AI assistant
5. `sdd spec execute feat-x` — Build tasks one by one
6. `sdd spec status` — Track progress
7. `sdd arch` — Visualize architecture

### When working on this project
- Read relevant specs in `specs/features/` before implementing features
- Check `.claude/steering/` for project context and conventions
- After completing tasks, they are auto-marked in `tasks.md`
<!-- sdd-kit:end -->

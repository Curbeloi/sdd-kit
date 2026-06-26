# Tasks: feat-init-skill-file

## Tasks

- [x] **1.1** Add shared `cliAvailable(cmd)` helper `src/core/cli-detect.js`
- [x] **1.2** Add pure `skillTargets({ claude, opencode })` → string[] `src/commands/init.js`
- [x] **1.3** Add SDD `SKILL.md` content constant (frontmatter + condensed workflow) `src/commands/init.js`
- [x] **1.4** Add `ensureSkillFile(cwd)` — detect CLIs, write to targets, idempotent `src/commands/init.js`
- [x] **1.5** Call `ensureSkillFile` from `initCmd` `src/commands/init.js`
- [x] **1.6** Add `sdd doctor` check: SKILL.md present for active agent_cli `src/commands/doctor.js`
- [x] **1.7** Instruction file by agent: create `AGENTS.md` when opencode detected (sync if exists); `CLAUDE.md` always `src/commands/init.js`
- [x] **2.1** Unit tests for `skillTargets` + `ensureSkillFile` (temp dir) `src/commands/init.test.js`
- [x] **2.2** Tests: AGENTS.md created on opencode, skipped otherwise, existing synced `src/commands/init.test.js`

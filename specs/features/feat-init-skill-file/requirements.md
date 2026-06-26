# Requirements: feat-init-skill-file

> Roadmap item 3. `sdd init` should drop an SDD skill file where the active agentic CLI will discover it, so the agent understands sdd-kit from day one with zero manual setup.

## User stories

- As a user running `sdd init` with Claude Code installed, I get `.claude/skills/sdd/SKILL.md` so Claude Code auto-loads the SDD skill in every session.
- As a user with opencode installed, I get `skills/sdd/SKILL.md`.
- As a user with both, I get both files.
- As a user with neither, I get a generic `skills/sdd/SKILL.md` fallback.

## Acceptance criteria

1. Detection is by CLI presence on `PATH` (`claude --version`, `opencode --version`).
2. Target mapping:
   | Detected | File(s) created |
   |---|---|
   | claude | `.claude/skills/sdd/SKILL.md` |
   | opencode | `skills/sdd/SKILL.md` |
   | both | both |
   | neither | `skills/sdd/SKILL.md` |
3. Filename is **uppercase `SKILL.md`** (Claude Code requires it for discovery).
4. The skill file carries YAML frontmatter (`name`, `description`) + a condensed SDD workflow (spec-first rule, key commands, spec sizes, structure, conventions).
5. Idempotent: existing `SKILL.md` is skipped, not overwritten.
6. The target-selection logic is a pure, unit-tested function.
7. `sdd doctor` reports whether the SKILL.md exists for the active `agent_cli`.

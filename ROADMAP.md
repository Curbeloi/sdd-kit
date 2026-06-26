# sdd-kit — Roadmap

Planned features in priority order. Each item maps to a future spec in `specs/`.

---

## 1. Provider selector command (`sdd provider`)

Interactive provider configuration via CLI — no manual `.sddrc` editing required.

**Subcommands:**
- `sdd provider list` — show all supported providers with current active one highlighted
- `sdd provider set <provider>` — write/update `.sddrc` with the selected provider (prompts for model + base_url when needed)
- `sdd provider models` — list available models for the active provider

**Details:**
- `sdd provider set` writes only the changed keys into `.sddrc` (preserves other settings)
- For OpenAI-compatible providers (openai/ollama/vllm), `sdd provider models` hits `/v1/models` and prints the list
- For Anthropic, calls `GET /v1/models` via the SDK
- If opencode is the active `agent_cli`, also lists models available through it
- Prompts to run `sdd doctor` after a provider change

**Example flow:**
```bash
sdd provider list
# ✓ active: anthropic (claude-sonnet-4-6)  [from .sddrc]
#   openai
#   ollama
#   vllm
#   claude-cli

sdd provider set ollama
# ? Model: llama3.1
# ? Base URL [http://localhost:11434/v1]: 
# ✓ Wrote to .sddrc → { "provider": "ollama", "model": "llama3.1" }
# Run `sdd doctor` to verify the setup.

sdd provider models
# Fetching models from http://localhost:11434/v1 ...
# llama3.1
# mistral
# phi3
```

---

## 2. Spec folders by type (not just `features/`)

Today all specs land in `specs/features/`. The prefix is free-form via `--name`, but there's no directory-level separation. Planned: route specs to a subdirectory that matches the prefix.

**How it would work:**
- The destination folder is derived from the name prefix:
  ```
  feat-*      → specs/features/
  fix-*       → specs/bugfix/
  bug-*       → specs/bugfix/
  hotfix-*    → specs/hotfix/
  chore-*     → specs/chore/
  refactor-*  → specs/refactor/
  docs-*      → specs/docs/
  perf-*      → specs/perf/
  <other>     → specs/features/   (fallback)
  ```
- `sdd spec list` and `sdd spec status` scan all subdirectories
- `sdd arch` aggregates across all subdirectories
- `.sddrc` can override `specs_dir` to a custom root, which remains the base

**Example:**
```bash
sdd spec create "Fix null pointer on empty cart" -1 --name fix-cart-null
# → specs/bugfix/fix-cart-null/tasks.md

sdd spec create "Upgrade deps to Node 22" -1 --name chore-node22
# → specs/chore/chore-node22/tasks.md
```

---

## 3. `sdd init` creates skill file in the right place

When `sdd init` runs, it should create a skill file so the active agentic CLI picks up sdd-kit's context natively — without the user copying anything manually.

**Logic:**
| Environment detected | Skill file created |
|---|---|
| `claude` on PATH | `.claude/skills/sdd/SKILL.md` |
| `opencode` on PATH | `skills/sdd/SKILL.md` |
| Both | both files |
| Neither | `skills/sdd/SKILL.md` (generic fallback) |

**Why:**
- Claude Code natively discovers `.claude/skills/*/SKILL.md` and exposes the skill in every session
- opencode natively discovers `skills/*/SKILL.md`
- Creating the right file means the agent understands `sdd` commands, spec structure, and conventions from day one — zero manual setup

**Content:** the skill file is a condensed version of `.claude/steering/` that explains sdd-kit's workflow to the agent (commands, spec structure, when to refresh, conventions). It's regenerated on `sdd init --auto` if steering has changed.

**Example:**
```bash
sdd init
# ✓ Created .claude/steering/product.md
# ✓ Created .claude/steering/tech.md
# ✓ Created .claude/steering/structure.md
# ✓ Created .claude/skills/sdd/SKILL.md    ← claude detected
# ✓ Updated CLAUDE.md (SDD section)
```

---

## Notes

- Items are independent and can be specced/executed separately.
- Use `sdd spec create "<item title>" -3 --name feat-<slug>` to scaffold each one when ready.
- `sdd doctor` should be extended to verify the skill file exists for the detected CLI (item 3).

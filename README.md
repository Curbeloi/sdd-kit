# sdd-kit

**Spec-Driven Development for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — language-agnostic, works with any project.

The biggest engineering orgs (Amazon's six-pagers, Google's design docs, Stripe's RFCs) have always written specs before code. `sdd-kit` brings that discipline to Claude Code — structured specs in, quality code out.

```
You describe what to build  →  sdd-kit structures the spec  →  Claude Code executes it
```

**Not a code generator. A clarity tool.** The spec is the source of truth. Claude Code is the execution engine.

---

## Requirements

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — the execution engine. Install: `npm install -g @anthropic-ai/claude-code`
- **Node.js >= 18**
- Optional: `ANTHROPIC_API_KEY` env var for faster SDK mode (bypasses Claude Code CLI for spec generation)

Without Claude Code, sdd-kit works in **prompt-only mode** (`--prompt-only`) — it generates structured prompts you can paste into any AI tool.

## Install

```bash
npm install -g sdd-kit
```

Or run without installing:

```bash
npx sdd-kit --help
```

> **Language:** sdd-kit detects your system language. Set `SDD_LANG=es` for Spanish or `SDD_LANG=en` for English.

## Quick start

### Existing project (already has code)

If you have an existing codebase and want to document it first:

```bash
# 1. Document your existing code modules
sdd spec document src/
sdd spec document src/auth/
sdd spec document src/services/api.ts

# 2. Generate architecture views from what exists
sdd arch

# 3. Initialize SDD (creates steering docs + updates CLAUDE.md)
#    Use --auto to generate steering from map specs
sdd init --auto

# 4. Now create specs for new features
sdd spec create "Add real-time notifications"
```

### New project (starting from scratch)

```bash
# 1. Initialize SDD structure
sdd init

# 2. Edit the steering files with your project context
#    .claude/steering/product.md   - what this project is
#    .claude/steering/tech.md      - your stack
#    .claude/steering/structure.md - how code is organized

# 3. Create your first spec
sdd spec create "JWT authentication for API endpoints"

# 4. Execute tasks from the spec
sdd spec execute feat-jwt-authentication

# 5. Check progress
sdd spec status

# 6. Generate architecture views
sdd arch
```

## How documentation stays up to date

sdd-kit keeps documentation in sync with code through **automatic refresh** at every step:

| Event | What gets updated |
|-------|-------------------|
| `sdd spec execute` completes a task | Project map specs are refreshed only for modules with **structural** changes (files added/deleted); steering docs are updated. Use `--refresh=auto` for old behavior (refresh on any change) or `--refresh=off` to skip. |
| `sdd spec create` generates a new spec | Steering docs are updated with the new feature |
| `sdd spec refresh` (manual) | Project map specs are regenerated **only for modules whose source files changed** (content-hash dedup via `.sdd/cache/`). By default the prompt ships **per-file symbol summaries** (~80% smaller than raw source). Use `--deep` for truncated source (old behavior, higher fidelity), `--force` to ignore the hash cache, `--verbose` to raise the per-module output budget from 1000 to 2000 tokens. |
| `sdd arch` | Architecture views + dashboard rebuilt from all specs |

**Living documentation flow:**

```
Code changes --> project map updates --> steering docs update --> arch views update
     (auto)           (auto)                 (auto)                (on demand)
```

Project map (`specs/_map/`) is auto-generated per directory. Steering docs (`.claude/steering/`) are auto-refreshed after spec operations. Architecture views (`specs/_arch/`) are rebuilt on `sdd arch`. The only manual step is running `sdd arch` when you want an updated dashboard.

## How it works

sdd-kit creates and manages structured Markdown specs in your repo:

```
your-project/
├── CLAUDE.md                  # Auto-updated with SDD section on `sdd init`
├── .claude/
│   └── steering/              # Project context (auto-refreshed)
│       ├── product.md         # Vision, users, goals
│       ├── tech.md            # Stack, infra, constraints
│       └── structure.md       # Code organization, conventions
├── specs/
│   ├── _map/                  # Living project map (auto-generated)
│   │   ├── src--auth.spec.md  # One spec per directory
│   │   ├── src--services.spec.md
│   │   └── ...
│   ├── features/              # One folder per feature
│   │   └── feat-jwt-auth/
│   │       ├── requirements.md    # User stories + acceptance criteria
│   │       ├── design.md          # Architecture, diagrams, API contracts
│   │       └── tasks.md           # Atomic tasks with checkboxes
│   └── _arch/                 # Generated architecture views
│       ├── architecture.md    # Mermaid diagrams (renders on GitHub)
│       ├── architecture.json  # Structured summary data
│       └── dashboard.html     # Interactive visual dashboard
```

Everything is Markdown. Everything lives in git. No lock-in.

## Commands

### `sdd init`

Scaffolds the SDD structure in your project. Creates `.claude/steering/` with template files, `specs/features/` directory, and adds an SDD section to `CLAUDE.md` so Claude always knows about your documentation.

```bash
# Template steering docs (manual edit)
sdd init

# Auto-generate steering from existing map specs
sdd init --auto
```

Safe to run multiple times — skips existing steering files, updates CLAUDE.md section idempotently.

### `sdd spec document <path>`

Reverse-engineers existing code into a map spec. This is the starting point for existing projects — document what you have before planning what to build.

```bash
# Document a directory
sdd spec document src/auth/

# Document a specific file
sdd spec document app/services/rag_service.py --name rag-service

# Without Claude Code
sdd spec document src/components/ --prompt-only
```

Output goes to `specs/_map/`. These specs are used as context for `sdd arch`, `sdd init --auto`, and `sdd spec create`.

### `sdd spec create <description>`

Generates spec files from a feature description. The CLI adapts to the size of the change via numeric flags:

| Flag | Files generated | When to use |
|------|----------------|-------------|
| `-1` | `tasks.md` only | Bug fixes, tweaks, refactors |
| `-2` *(default)* | `requirements.md` + `tasks.md` | Clear features (1-3 days) |
| `-3` | `requirements.md` + `design.md` + `tasks.md` | Complex features, new architecture |

```bash
# Bug fix — just tasks, no ceremony
sdd spec create "Fix 422 error on login endpoint" -1

# Default — requirements + tasks
sdd spec create "Add JWT refresh tokens"

# Complex feature — full spec with design doc
sdd spec create "Hybrid RAG search pipeline" -3

# Custom name
sdd spec create "WhatsApp webhook integration" --name feat-whatsapp-hooks
```

### `sdd spec status [spec-name]`

Shows project progress with visual indicators.

```bash
# All specs overview
sdd spec status

# Output:
# SDD Project Status
#
#   3 specs · 5/12 tasks · ████████░░░░░░░░░░░░ 42%
#
#   feat-jwt-auth              RDT  ████████████████ 3/3 done
#   feat-rag-search            RDT  ████████░░░░░░░░ 2/5 40%
#   feat-whatsapp-hooks        RDT  ░░░░░░░░░░░░░░░░ 0/4 planned

# Single spec with task details
sdd spec status feat-rag-search --verbose
```

Indicators: **R** = requirements.md, **D** = design.md, **T** = tasks.md (green = exists, dim = missing).

### `sdd spec execute <spec-name>`

Executes the next pending task via Claude Code. Sends the task description along with requirements, design, and module context so Claude has full understanding. After execution, refreshes map specs only for modules with **structural** changes (files added/deleted) — tunable via `--refresh`.

```bash
# Next pending task
sdd spec execute feat-jwt-auth

# Specific task
sdd spec execute feat-jwt-auth --task 1.2

# Preview without executing
sdd spec execute feat-rag-search --dry-run

# Skip all auto-refresh (module + steering)
sdd spec execute feat-jwt-auth --refresh=off

# Old behavior — refresh on any changed file
sdd spec execute feat-jwt-auth --refresh=auto
```

### `sdd spec refresh [dir]`

Manually refreshes map specs (living documentation). Useful after making changes outside of `sdd spec execute`.

```bash
# Refresh changed modules (symbol summaries, 1000 tokens/module)
sdd spec refresh

# Refresh one directory
sdd spec refresh src/core

# Higher detail output (2000 tokens/module)
sdd spec refresh --verbose

# Regenerate everything, ignoring the cached hash
sdd spec refresh --force

# Send full truncated source instead of symbol summaries (higher fidelity, higher cost)
sdd spec refresh --deep
```

**How the dedup works.** Each generated `<label>.spec.md` carries a `source_hash` in its YAML frontmatter. On subsequent runs, modules whose content-hash matches the stored one are skipped — no Claude call. The per-file hash cache lives at `.sdd/cache/hashes.json` (safe to delete — it rebuilds).

**How the symbol summary works.** By default, the prompt for each module contains per-file headers with extracted top-level symbols (functions, classes, exports, imports) rather than truncated source code. Measured on sdd-kit's own `src/` tree, this shrinks the prompt by ~80% while preserving enough structure for Claude to infer module purpose and relationships. Pass `--deep` when you need the old behavior.

### `sdd spec list`

Lists all specs with a compact summary: files present, task progress, and date.

```bash
sdd spec list

# Output:
# feat-jwt-auth              RDT  done     2025-12-01
# feat-rag-search            R-T  2/5      2025-12-15
# feat-whatsapp-hooks        ---  empty    2026-01-10
```

### `sdd spec delete <name>`

Deletes a spec directory after confirmation.

```bash
# With confirmation prompt
sdd spec delete feat-old-feature

# Skip confirmation
sdd spec delete feat-old-feature --force
```

### `sdd spec rename <old> <new>`

Renames a spec directory and updates internal Markdown headers.

```bash
sdd spec rename feat-old-name feat-new-name
```

### `sdd spec archive <name>`

Moves a spec to `specs/archived/` to keep it out of `sdd spec status` and `sdd arch`. Use `--restore` to bring it back.

```bash
# Archive a completed spec
sdd spec archive feat-jwt-auth

# Restore it later
sdd spec archive feat-jwt-auth --restore
```

### `sdd arch`

Generates architecture views from all specs, module docs, and steering docs. Produces:

- **`architecture.md`** — Mermaid diagrams that render directly on GitHub
- **`architecture.json`** — Structured data (components, features, tech stack)
- **`dashboard.html`** — Interactive HTML dashboard with system overview, service map, module breakdown, feature flows, and progress stats

```bash
# Generate architecture views
sdd arch

# Without Claude Code
sdd arch --prompt-only

# Open the dashboard
open specs/_arch/dashboard.html
```

### `sdd config`

Shows the active configuration, including values from `.sddrc` and defaults.

```bash
sdd config

# Output:
# specs_dir       specs/features       (default)
# modules_dir     specs/_map           (default)
# concurrency     4                    (default)
# max_file_size   50KB                 (default)
```

You can customize sdd-kit by creating a `.sddrc` file (JSON) in your project root:

```json
{
  "specs_dir": "docs/specs",
  "concurrency": 2,
  "max_file_size": 102400,
  "max_depth": 10
}
```

Available options: `specs_dir`, `modules_dir`, `steering_dir`, `arch_dir`, `concurrency`, `max_file_size`, `max_depth`.

## Built for Claude Code

sdd-kit is designed specifically for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Every command leverages Claude Code's full project understanding — it reads your files, follows your CLAUDE.md conventions, and writes code that fits your codebase.

| Mode | When | What happens |
|------|------|-------------|
| **Claude Code** | `claude` CLI installed | Full execution — reads project, generates specs, writes code, updates docs |
| **SDK** | `ANTHROPIC_API_KEY` set | Fast mode — uses Anthropic API directly for spec generation (no code execution) |
| **Prompt-only** | `--prompt-only` flag | Saves structured prompts you paste into any AI tool |

```bash
# Claude Code mode (default) — full power
sdd spec create "Add caching layer"
sdd spec execute feat-caching

# Prompt-only — works without Claude Code
sdd spec create "Add caching layer" --prompt-only
```

Why Claude Code? Because a raw API call sees nothing but the prompt. Claude Code sees your entire project, your conventions, your existing code. The specs sdd-kit generates become Claude Code's instructions — structured context that produces better code.

## Task format

Tasks in `tasks.md` follow this format:

```markdown
- [ ] **1.1** Create User model `app/models/user.py`
- [x] **1.2** Add login endpoint `app/routers/auth.py` <- Req 1.1
- [ ] **2.1** Write integration tests `tests/test_auth.py`
```

Each task has: checkbox, numbered ID, description, optional file path, optional requirement reference. The `spec-reader` parses this exact format for progress tracking and execution.

## Spec sizes: why it matters

> "Using a full SDD workflow for a bug fix is like using a sledgehammer to crack a nut."
> — Birgitta Boeckeler, Thoughtworks ([Martin Fowler's blog](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html))

Not every change needs three documents. A typo fix doesn't need acceptance criteria. A one-line bug fix doesn't need an architecture diagram. The numeric size flag adapts the ceremony to the change:

- **`-1` small**: You know exactly what to do. Just need to track the tasks.
- **`-2` medium** *(default)*: Requirements are clear, but you want documented acceptance criteria before implementation.
- **`-3` large**: The problem space is complex. You need to think through architecture, data models, and API contracts before writing code.

## Works with any project

sdd-kit reads only Markdown. It doesn't parse your code, import your modules, or require any specific language or framework. Use it with:

- React / Next.js / Vue
- FastAPI / Django / Express
- Rails / Laravel / Spring
- Mobile apps, CLI tools, infrastructure
- Any language, any framework

## Project structure

```
sdd-kit/
├── bin/sdd.js                  # CLI entry point
├── src/
│   ├── cli.js                  # Commander setup
│   ├── core/
│   │   ├── config.js           # .sddrc configuration system
│   │   ├── log.js              # Debug logging (SDD_DEBUG=1)
│   │   ├── generator.js        # Claude Code CLI invocation + prompt fallback
│   │   ├── claude-api.js       # Claude API engine (alternative to CLI)
│   │   ├── spec-reader.js      # Read/parse specs from disk
│   │   ├── scanner.js          # Project directory scanner
│   │   ├── git-changes.js      # Git diff detection for smart refresh
│   │   └── progress.js         # Progress indicator for streaming
│   └── commands/
│       ├── init.js             # Init + CLAUDE.md integration + steering refresh
│       ├── config.js           # Show active configuration
│       ├── arch.js             # Architecture views + dashboard
│       └── spec/
│           ├── create.js       # Create feature specs
│           ├── document.js     # Reverse-engineer code into specs
│           ├── execute.js      # Execute tasks from specs
│           ├── refresh.js      # Refresh map specs
│           ├── status.js       # Show progress
│           ├── list.js         # List all specs
│           ├── delete.js       # Delete a spec
│           ├── rename.js       # Rename a spec
│           └── archive.js      # Archive/restore specs
├── templates/
│   ├── arch-dashboard.html     # HTML dashboard template
│   └── steering/               # Init templates
└── package.json
```

## Contributing

```bash
# Clone and install
git clone https://github.com/icurbe/sdd-kit.git
cd sdd-kit
pnpm install

# Run locally
node bin/sdd.js --help

# Link for global testing
pnpm link --global
sdd --help
```

## License

MIT — [iCurbe](https://icurbe.com)

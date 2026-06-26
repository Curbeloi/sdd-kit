# sdd-kit

**Spec-Driven Development for AI coding agents** — works with Claude Code, OpenAI, Ollama, vLLM, or opencode. Language-agnostic, works with any project.

The biggest engineering orgs (Amazon's six-pagers, Google's design docs, Stripe's RFCs) have always written specs before code. `sdd-kit` brings that discipline to your AI workflow — structured specs in, quality code out.

```
You describe what to build  →  sdd-kit structures the spec  →  your agent executes it
```

**Not a code generator. A clarity tool.** The spec is the source of truth. Your coding agent is the execution engine — Claude Code by default, or any provider you choose.

---

## Highlights

- 🧩 **Any LLM provider** — Anthropic, OpenAI, **Ollama**, **vLLM**, or [opencode](https://github.com/sst/opencode). Switch with one line of config. → [LLM providers](#llm-providers-multi-provider)
- 📐 **Right-sized specs** — `-1` for a bug fix, `-3` for new architecture. No ceremony you don't need.
- 🔄 **Living documentation** — feature specs, a per-directory module map, and architecture views stay in sync with your code automatically.
- 🩺 **`sdd doctor`** — one command validates your whole setup (keys, packages, endpoints, CLIs) before you run.
- 🌍 **Language-agnostic** — pure Markdown, lives in git, works with any stack. No lock-in.
- 🤖 **Claude Code native** — specs become structured context, so Claude writes code that fits *your* project.

```bash
sdd spec create "JWT auth for the API"   # structure the spec
sdd spec execute feat-jwt-auth           # Claude Code builds it
sdd doctor                               # check your provider/CLI setup
```

---

## Requirements

**Node.js >= 18** is the only hard requirement. For the AI engine, pick whatever you already use:

- **Claude Code** *(default, recommended)* — the richest experience. Install: `npm install -g @anthropic-ai/claude-code`
- **Anthropic API** — set `ANTHROPIC_API_KEY` for faster SDK mode (spec generation straight from the API)
- **OpenAI / Ollama / vLLM** — any OpenAI-compatible provider, hosted or fully local
- **[opencode](https://github.com/sst/opencode)** — alternative agentic CLI

→ Wire up any of them in one line: [LLM providers](#llm-providers-multi-provider).

No engine at all? sdd-kit still runs in **prompt-only mode** (`--prompt-only`) — it generates structured prompts you can paste into any AI tool.

## Quick start

Follow these steps in order. Each builds on the previous one.

### Step 1 — Install

```bash
npm install -g sdd-kit      # or run ad-hoc with: npx sdd-kit <command>
```

> **Language:** sdd-kit follows your system language. Force it with `SDD_LANG=es` (Spanish) or `SDD_LANG=en` (English).

### Step 2 — Choose your engine *(optional)*

By default sdd-kit uses **Claude Code** (if `claude` is installed) or the **Anthropic API** (if `ANTHROPIC_API_KEY` is set). To use OpenAI, a local Ollama, vLLM, or opencode, set it once in a `.sddrc` file at your project root:

```jsonc
// .sddrc — example: local Ollama, no API key needed
{ "provider": "ollama", "model": "llama3.1" }
```

Then confirm everything is wired up before you run anything real:

```bash
sdd doctor                  # ✓ package, ✓ endpoint reachable, ✓ model, ✓ CLI on PATH
```

→ Full options in [LLM providers](#llm-providers-multi-provider).

### Step 3 — Initialize the project

```bash
sdd init                    # scaffolds .claude/steering/ + specs/, updates CLAUDE.md
```

Then fill in the steering files with your project context:

- `.claude/steering/product.md` — what this project is (vision, users, goals)
- `.claude/steering/tech.md` — your stack and constraints
- `.claude/steering/structure.md` — how the code is organized

> **Already have a codebase?** Document it first so specs have real context, then auto-generate steering:
> ```bash
> sdd spec document src/      # reverse-engineer modules into specs/_map/
> sdd init --auto             # generate steering from those module specs
> ```

### Step 4 — Create a spec

```bash
sdd spec create "JWT authentication for API endpoints"
#   -1 = tasks only (bug fix) · -2 = requirements + tasks (default) · -3 = full spec
```

Open the generated `specs/features/feat-jwt-authentication/` and review it before building.

### Step 5 — Execute tasks

```bash
sdd spec execute feat-jwt-authentication   # runs the next pending task
```

Repeat until every task is checked off. Each run sends the task plus its requirements, design, and module context to the engine, then auto-refreshes docs.

### Step 6 — Track & visualize

```bash
sdd spec status             # progress across all specs
sdd arch                    # build architecture views + dashboard.html
open specs/_arch/dashboard.html
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

**Spec name & "type".** sdd-kit models the **size** of a change (`-1`/`-2`/`-3`) — it does *not* enforce a fixed set of types. The "type" is simply the **prefix you choose in `--name`**, and it's free-form: `feat-`, `fix-`, `bug-`, `chore-`, `refactor-`, `docs-`, `perf-`, whatever your team uses.

- With `--name`, the name is used **verbatim** — pick any prefix.
- Without `--name`, the name is auto-generated from the description and **always prefixed `feat-`** (even for a bug fix).

```bash
sdd spec create "Fix 422 on login"    -1 --name fix-login-422     # bug fix
sdd spec create "Bump dependencies"    -1 --name chore-deps        # chore
sdd spec create "Refactor auth module" -2 --name refactor-auth     # refactor
sdd spec create "Add JWT auth"                                     # → feat-add-jwt-auth (auto)
```

> Tip: choose the **size flag** for ceremony (`-1` bug fix → `-3` architecture) and the **`--name` prefix** for type. Use `--name` whenever you want anything other than `feat-`.

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
# provider        auto                 (default)
# model           (unset)              (default)
# agent_cli       claude               (default)
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

Available options:

| Key | Default | Purpose |
|-----|---------|---------|
| `specs_dir`, `modules_dir`, `steering_dir`, `arch_dir` | conventional paths | Where specs/maps/steering/arch live |
| `concurrency` | `4` | Max parallel LLM requests |
| `max_file_size`, `max_depth` | `50KB`, `8` | Scanner limits |
| `provider` | `auto` | Text-gen provider — see [LLM providers](#llm-providers-multi-provider) |
| `model` | per-provider | Model for the text-gen layer |
| `base_url`, `api_key_env` | per-provider | OpenAI-compatible endpoint + key env var |
| `agent_cli` | `claude` | Agentic CLI for `create`/`execute`/`arch` (`claude` \| `opencode`) |
| `agent_model` | inherit | Model for the agentic CLI (e.g. Claude Code alias `sonnet`/`opus`) |

### `sdd doctor`

Validates your active provider/CLI setup — keys, the `openai` package, endpoint reachability, model, and the agentic CLI on `PATH`. Exits non-zero on failure (CI-friendly). See [LLM providers](#llm-providers-multi-provider).

```bash
sdd doctor
sdd doctor --provider ollama --model llama3.1   # check a specific setup
```

## LLM providers (multi-provider)

sdd-kit talks to LLMs in **two independent layers**, each separately configurable:

- **Text generation** (`init`, `spec refresh`, `spec document`) → `provider` + `model`.
- **Agentic execution** (`spec create`, `spec execute`, `arch`) → `agent_cli` + `agent_model`.

Every option can be set in `.sddrc` or via env var (`.sddrc` wins): `SDD_PROVIDER`, `SDD_MODEL`, `SDD_BASE_URL`, `SDD_API_KEY_ENV`, `SDD_AGENT_CLI`, `SDD_AGENT_MODEL`.

### Text-generation providers (`provider`)

| `provider` | Engine | Needs |
|------------|--------|-------|
| `auto` *(default)* | Anthropic API if `ANTHROPIC_API_KEY`, else OpenAI if `OPENAI_API_KEY`, else Claude Code CLI | — |
| `anthropic` | Anthropic SDK (native) | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI Chat Completions | `OPENAI_API_KEY` + `pnpm add openai` |
| `ollama` | Local Ollama (OpenAI-compatible) | Ollama running + `pnpm add openai` |
| `vllm` | Self-hosted vLLM (OpenAI-compatible) | vLLM serving + `pnpm add openai` |
| `claude-cli` | `claude -p` (your Claude Code subscription) | Claude Code CLI |

> `openai`, `ollama`, and `vllm` all speak the **OpenAI-compatible API** — they share one implementation; only `base_url`/`model`/key differ. The `openai` npm package is an **optional** dependency: install it only if you use one of these (`pnpm add openai`). sdd-kit prints an actionable error if it's missing.

**Anthropic API (default when key is set):**
```json
{ "provider": "anthropic", "model": "claude-sonnet-4-6" }
```

**OpenAI:**
```json
{ "provider": "openai", "model": "gpt-4o" }   // reads OPENAI_API_KEY
```

**Ollama (local, no key):**
```json
{ "provider": "ollama", "model": "llama3.1" } // base_url defaults to http://localhost:11434/v1
```

**vLLM (self-hosted):**
```json
{ "provider": "vllm", "model": "meta-llama/Llama-3.1-8B-Instruct", "base_url": "http://localhost:8000/v1", "api_key_env": "VLLM_API_KEY" }
```

### Agentic CLI (`agent_cli`)

The commands that actually write code/specs run through an agentic CLI. Default is `claude` (Claude Code). To use [opencode](https://github.com/sst/opencode) instead:

```json
{ "agent_cli": "opencode", "agent_model": "anthropic/claude-sonnet-4-6" }
```

`sdd spec execute` / `create` / `arch` then shell out to `opencode run` (model format is `provider/model`). If the configured CLI isn't installed, these commands fall back to **prompt-only** mode (`--prompt-only`).

> Leave `agent_model` empty to inherit the CLI's own default model (e.g. your Claude Code default). For `claude`, set a Claude Code alias (`sonnet`/`opus`/`haiku`); for `opencode`, use `provider/model`.

**opencode mostly works with zero config.** opencode natively discovers `.claude/skills/*/SKILL.md`, so the sdd-kit skill is picked up automatically. It also reads `CLAUDE.md` as a fallback when no `AGENTS.md` exists, so the SDD steering block from `sdd init` is seen out of the box. If your project already has an `AGENTS.md` (opencode's primary instruction file, which takes precedence over `CLAUDE.md`), `sdd init` mirrors the SDD block into it so opencode still gets the steering.

### Per-command overrides

Every LLM command (`spec create`/`execute`/`refresh`/`document`, `arch`, `init`, `doctor`) accepts `--provider` and `--model` to override `.sddrc`/env for that run — handy for quick tests:

```bash
sdd spec refresh --provider ollama --model llama3.1
sdd spec document src/ --provider openai --model gpt-4o
```

### Validate your setup: `sdd doctor`

`sdd doctor` checks the active configuration and tells you exactly what's missing:

```bash
sdd doctor
# ✓ openai package installed
# ✓ model = llama3.1
# ✓ endpoint reachable  (http://localhost:11434/v1)
# ✓ agentic CLI "claude" on PATH
```

Per layer it verifies: API key present (anthropic/openai), the `openai` package installed (openai/ollama/vllm), the **endpoint reachable**, a model configured, and the agentic CLI on `PATH`. Exits non-zero if any check fails — useful in CI. Accepts `--provider`/`--model` too.

> **OpenAI new models:** the o-series and gpt-5 reject `max_tokens` in favor of `max_completion_tokens`. sdd-kit sends the right one automatically (and retries with the other if an endpoint disagrees), so OpenAI, Ollama, and vLLM all work without tuning.

## Built for Claude Code

sdd-kit is designed specifically for Claude Code. Every command leverages Claude Code's full project understanding — it reads your files, follows your CLAUDE.md conventions, and writes code that fits your codebase.

| Mode | When | What happens |
|------|------|-------------|
| **Claude Code** | `claude` CLI installed | Full execution — reads project, generates specs, writes code, updates docs |
| **SDK / API** | `ANTHROPIC_API_KEY` set (or another provider) | Fast mode — calls the LLM API directly for spec generation (no code execution) |
| **Prompt-only** | `--prompt-only` flag | Saves structured prompts you paste into any AI tool |

Claude Code is the default and the richest experience, but the text-generation layer is **provider-agnostic** — point it at OpenAI, a local Ollama, or vLLM, and swap the agentic CLI for opencode if you prefer. See [LLM providers](#llm-providers-multi-provider).

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
│   │   ├── config.js           # .sddrc + env + CLI-override config system
│   │   ├── log.js              # Debug logging (SDD_DEBUG=1)
│   │   ├── generator.js        # Agentic CLI invocation (claude/opencode) + prompt fallback
│   │   ├── claude-api.js       # Text-gen facade over the provider layer
│   │   ├── providers/          # LLM providers (anthropic, openai-compatible, claude-cli)
│   │   │   ├── index.js        # selectProvider — config/env-driven selection
│   │   │   ├── anthropic-provider.js
│   │   │   ├── openai-provider.js   # OpenAI / Ollama / vLLM
│   │   │   └── cli-provider.js
│   │   ├── spec-reader.js      # Read/parse specs from disk
│   │   ├── scanner.js          # Project directory scanner
│   │   ├── git-changes.js      # Git diff detection for smart refresh
│   │   └── progress.js         # Progress indicator for streaming
│   └── commands/
│       ├── init.js             # Init + CLAUDE.md/AGENTS.md integration + steering refresh
│       ├── config.js           # Show active configuration
│       ├── doctor.js           # Validate provider / agentic CLI setup
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

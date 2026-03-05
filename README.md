# sdd-kit

**Spec-Driven Development CLI** — language-agnostic, works with any project.

The biggest engineering orgs (Amazon's six-pagers, Google's design docs, Stripe's RFCs) have always written specs before code. `sdd-kit` brings that discipline to any team — with or without AI.

```
You describe what to build  -->  sdd-kit structures the spec  -->  Anyone (or any agent) executes it
```

**Not a code generator. A clarity tool.** The spec is the source of truth. The execution — human or AI — is secondary.

---

## Install

```bash
npm install -g sdd-kit
```

Or run without installing:

```bash
npx sdd-kit --help
```

Requires Node.js >= 18 and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`). Works in prompt-only mode without Claude Code.

## Quick start

```bash
# 1. Initialize SDD in your project
sdd init

# 2. Edit the steering files with your project context
#    .claude/steering/product.md   - what this project is
#    .claude/steering/tech.md      - your stack
#    .claude/steering/structure.md - how code is organized

# 3. Create your first spec
sdd spec create "JWT authentication for API endpoints" --size medium

# 4. Check progress
sdd spec status

# 5. Generate architecture views
sdd arch
```

## How it works

sdd-kit creates and manages structured Markdown specs in your repo:

```
your-project/
├── .claude/
│   └── steering/              # Project context (memory bank)
│       ├── product.md         # Vision, users, goals
│       ├── tech.md            # Stack, infra, constraints
│       └── structure.md       # Code organization, conventions
├── specs/
│   ├── features/              # One folder per feature
│   │   └── feat-jwt-auth/
│   │       ├── requirements.md    # User stories + acceptance criteria
│   │       ├── design.md          # Architecture, diagrams, API contracts
│   │       └── tasks.md           # Atomic tasks with checkboxes
│   └── _arch/                 # Generated architecture views
│       ├── architecture.md    # Mermaid diagrams (renders on GitHub)
│       └── dashboard.html     # Interactive visual dashboard
```

Everything is Markdown. Everything lives in git. No lock-in.

## Commands

### `sdd init`

Scaffolds the SDD structure in your project. Creates `.claude/steering/` with template files and `specs/features/` directory. Safe to run multiple times — skips existing files.

```bash
sdd init
```

### `sdd spec create <description>`

Generates spec files from a feature description. The CLI adapts to the size of the change:

| Size | Files generated | When to use |
|------|----------------|-------------|
| `small` | `tasks.md` only | Bug fixes, tweaks, refactors |
| `medium` | `requirements.md` + `tasks.md` | Clear features (1-3 days) |
| `large` | `requirements.md` + `design.md` + `tasks.md` | Complex features, new architecture |

```bash
# Bug fix — just tasks, no ceremony
sdd spec create "Fix 422 error on login endpoint" --size small

# Medium feature — requirements + tasks
sdd spec create "Add JWT refresh tokens" --size medium

# Complex feature — full spec with design doc (default)
sdd spec create "Hybrid RAG search pipeline"

# Custom name
sdd spec create "WhatsApp webhook integration" --name whatsapp-hooks

# Without Claude Code — saves a prompt file
sdd spec create "User dashboard" --prompt-only
```

The CLI detects bug-fix keywords (`fix`, `bug`, `crash`, `patch`) and suggests using `--size small` when you use `large` for what looks like a small change.

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

Executes the next pending task via Claude Code. Sends the task description along with requirements and design context so Claude has full understanding. Falls back to saving a prompt file if Claude Code is not installed.

```bash
# Next pending task
sdd spec execute feat-jwt-auth

# Specific task
sdd spec execute feat-jwt-auth --task 1.2

# Preview without output
sdd spec execute feat-rag-search --dry-run
```

The generated prompt instructs to mark the task `[x]` in `tasks.md` when done — so progress tracking stays in sync.

### `sdd arch`

Generates architecture views from all specs and steering docs. Produces two outputs:

- **`architecture.md`** — Mermaid diagrams that render directly on GitHub
- **`dashboard.html`** — Interactive HTML dashboard with system overview, service map, module breakdown, feature flows, and progress stats

```bash
# Generate architecture views
sdd arch

# Without Claude Code
sdd arch --prompt-only

# Open the dashboard
open specs/_arch/dashboard.html
```

## Powered by Claude Code

sdd-kit uses [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as its execution engine. When Claude Code is installed, every command runs through it — no API key needed, no separate configuration.

| Mode | When | What happens |
|------|------|-------------|
| **Claude Code** | `claude` CLI is installed | Invokes Claude Code directly — it reads your project, generates files, executes tasks |
| **Prompt-only** | `claude` not found, or `--prompt-only` | Saves a structured prompt file you paste into any AI tool |

```bash
# If Claude Code is installed, this just works
sdd spec create "Add caching layer"

# Force prompt-only mode
sdd spec create "Add caching layer" --prompt-only
```

Why Claude Code instead of a direct API call? Because Claude Code has full project context — it reads your files, understands your codebase, and follows your CLAUDE.md conventions. A raw API call sees nothing but the prompt.

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

Not every change needs three documents. A typo fix doesn't need acceptance criteria. A one-line bug fix doesn't need an architecture diagram. The `--size` flag adapts the ceremony to the change:

- **small**: You know exactly what to do. Just need to track the tasks.
- **medium**: Requirements are clear, but you want documented acceptance criteria before implementation.
- **large**: The problem space is complex. You need to think through architecture, data models, and API contracts before writing code.

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
│   │   ├── generator.js        # Claude Code CLI invocation + prompt fallback
│   │   └── spec-reader.js      # Read/parse specs from disk
│   └── commands/
│       ├── init.js
│       ├── arch.js
│       └── spec/
│           ├── create.js
│           ├── execute.js
│           └── status.js
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
npm install

# Run locally
node bin/sdd.js --help

# Link for global testing
npm link
sdd --help
```

## License

MIT — [iCurbe](https://icurbe.com)

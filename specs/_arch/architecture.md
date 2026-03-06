# Architecture — sdd-kit

> Auto-generated architecture views for the Spec-Driven Development Kit.

---

### SECTION: OVERVIEW
```mermaid
graph TD
    User["👤 Developer"]
    CLI["sdd CLI<br/>(cli.js — Commander.js)"]
    Commands["Commands Layer<br/>(commands/)"]
    Core["Core Engine<br/>(core/)"]
    ClaudeCLI["Claude Code CLI<br/>(subprocess)"]
    ClaudeSDK["Claude API<br/>(@anthropic-ai/sdk)"]
    FS["File System<br/>(specs/, .claude/)"]
    Git["Git"]

    User -->|"sdd &lt;command&gt;"| CLI
    CLI -->|routes subcommands| Commands
    Commands -->|delegates logic| Core
    Core -->|spawns subprocess| ClaudeCLI
    Core -->|SDK calls| ClaudeSDK
    Core -->|reads/writes| FS
    Core -->|diff / snapshot| Git
    Commands -->|UX: spinners, color| User
```

---

### SECTION: SERVICES
```mermaid
graph LR
    subgraph CLI_Layer["CLI Layer"]
        cli["cli.js<br/>arg parsing + routing"]
    end

    subgraph Command_Handlers["Command Handlers"]
        create["spec create"]
        document["spec document"]
        execute["spec execute"]
        status["spec status"]
        refresh["spec refresh"]
        arch["arch"]
        init["init"]
    end

    subgraph Core_Services["Core Services"]
        generator["generator.js<br/>prompt templates + Claude Code calls"]
        claudeApi["claude-api.js<br/>SDK / CLI dual engine"]
        scanner["scanner.js<br/>directory tree → analysis prompts"]
        specReader["spec-reader.js<br/>spec & steering I/O"]
        gitChanges["git-changes.js<br/>diff snapshots"]
        progress["progress.js<br/>ora spinner callback"]
    end

    subgraph External["External"]
        claudeCode["Claude Code CLI"]
        anthropicSDK["Anthropic SDK"]
        gitBin["git binary"]
    end

    subgraph Artifacts["Artifacts on Disk"]
        specsFeatures["specs/features/*.md"]
        specsMap["specs/_map/*.spec.md"]
        specsArch["specs/_arch/"]
        steering[".claude/steering/"]
        claudeMd["CLAUDE.md"]
    end

    cli --> create & document & execute & status & refresh & arch & init

    create --> generator
    create --> specReader
    document --> scanner
    document --> claudeApi
    execute --> generator
    execute --> specReader
    execute --> gitChanges
    execute --> refresh
    refresh --> claudeApi
    refresh --> specReader
    arch --> specReader
    arch --> generator
    init --> claudeApi
    init --> specReader
    status --> specReader

    generator --> claudeCode
    claudeApi --> claudeCode
    claudeApi --> anthropicSDK
    gitChanges --> gitBin

    specReader --> specsFeatures & specsMap & steering
    generator --> specsFeatures
    scanner --> specsMap
    arch --> specsArch
    init --> steering & claudeMd
```

---

### SECTION: FLOWS

#### Flow: spec-create
```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as sdd CLI
    participant Create as spec/create.js
    participant Gen as generator.js
    participant Claude as Claude Code CLI
    participant FS as File System

    Dev->>CLI: sdd spec create "JWT auth" --size large
    CLI->>Create: createCmd({ description, size })
    Create->>Gen: detectMode(promptOnly)
    alt Claude Code available
        Create->>Gen: generateCreateSpec(description, size)
        Gen->>Claude: spawn claude --output-format stream-json
        Claude-->>Gen: streamed tool calls + text
        Gen-->>Create: spec content (requirements, design, tasks)
        Create->>FS: write specs/features/feat-jwt-auth/
    else promptOnly or unavailable
        Create->>FS: save prompt markdown for manual use
    end
    Create-->>Dev: spec files created ✓
```

#### Flow: spec-document
```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as sdd CLI
    participant Doc as spec/document.js
    participant Scanner as scanner.js
    participant API as claude-api.js
    participant Claude as Claude Engine
    participant FS as File System

    Dev->>CLI: sdd spec document src/auth/
    CLI->>Doc: documentCmd({ source })
    Doc->>Scanner: scanTree(source)
    Scanner-->>Doc: file tree + groups
    Doc->>Scanner: groupByDirectory(tree)
    loop Each directory group (parallel)
        Doc->>Scanner: buildGroupPrompt(dir, files)
        Doc->>API: batchAsk(prompts)
        API->>Claude: per-directory analysis
        Claude-->>API: partial spec markdown
    end
    Doc->>Scanner: buildSynthesisPrompt(partials)
    Doc->>API: askClaude(synthesisPrompt)
    API->>Claude: synthesize unified spec
    Claude-->>Doc: final module spec
    Doc->>FS: write specs/_map/{name}.spec.md
    Doc-->>Dev: documentation complete ✓
```

#### Flow: spec-execute-with-living-docs
```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as sdd CLI
    participant Exec as spec/execute.js
    participant Reader as spec-reader.js
    participant Gen as generator.js
    participant Git as git-changes.js
    participant Refresh as spec/refresh.js
    participant Claude as Claude Code CLI
    participant FS as File System

    Dev->>CLI: sdd spec execute feat-jwt-auth
    CLI->>Exec: executeCmd({ specName })
    Exec->>Reader: readSpec("feat-jwt-auth")
    Reader-->>Exec: spec + tasks
    Exec->>Reader: findNextPendingTask(tasks)
    Reader-->>Exec: task 1.1
    Exec->>Git: snapshotBefore(cwd)
    Git-->>Exec: pre-execution file hashes
    Exec->>Gen: executeTask(spec, task, context)
    Gen->>Claude: spawn claude with task prompt
    Claude-->>Gen: code changes applied
    Gen-->>Exec: execution complete
    Exec->>Git: getChangedSince(snapshot)
    Git-->>Exec: list of changed files
    Exec->>Git: getAffectedModuleDirs(changedFiles)
    Git-->>Exec: affected directories
    loop Each affected directory
        Exec->>Refresh: refreshModule({ dir })
        Refresh->>FS: update specs/_map/{dir}.spec.md
    end
    Exec-->>Dev: task done + living docs refreshed ✓
```

#### Flow: arch-generation
```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as sdd CLI
    participant Arch as arch.js
    participant Reader as spec-reader.js
    participant Gen as generator.js
    participant Claude as Claude Code CLI
    participant FS as File System

    Dev->>CLI: sdd arch
    CLI->>Arch: archCmd({ level })
    Arch->>Reader: readAllSpecs(cwd)
    Arch->>Reader: readModuleSpecs(cwd)
    Arch->>Reader: readSteering(cwd)
    Reader-->>Arch: all specs + steering context
    Arch->>Gen: generateArchitecture(context)
    Gen->>Claude: spawn claude with architecture prompt
    Claude-->>Gen: architecture.md content
    Gen-->>Arch: markdown with Mermaid diagrams
    Arch->>FS: write specs/_arch/architecture.md
    Arch->>FS: generate specs/_arch/dashboard.html
    Arch-->>Dev: architecture views ready ✓
```

#### Flow: init
```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as sdd CLI
    participant Init as init.js
    participant API as claude-api.js
    participant Reader as spec-reader.js
    participant FS as File System

    Dev->>CLI: sdd init --auto
    CLI->>Init: initCmd({ auto: true })
    Init->>FS: scaffold .claude/steering/ + specs/features/
    Init->>Reader: readModuleSpecs(cwd)
    Reader-->>Init: existing module specs
    Init->>API: askClaude(steering generation prompt)
    API-->>Init: generated steering docs
    Init->>FS: write .claude/steering/*.md
    Init->>FS: inject SDD block into CLAUDE.md
    Init-->>Dev: project initialized ✓
```

---

### SECTION: MODULES
```mermaid
graph TD
    subgraph root["Root (cli.js)"]
        cli["cli.js<br/>Commander.js program<br/>bilingual EN/ES help"]
    end

    subgraph commands["commands/"]
        subgraph spec_cmds["spec/"]
            create["create.js<br/>Generate feature specs"]
            document["document.js<br/>Reverse-engineer code → specs"]
            execute["execute.js<br/>Run next pending task"]
            status["status.js<br/>Progress dashboard"]
            refresh["refresh.js<br/>Living doc refresh"]
        end
        arch["arch.js<br/>Architecture views + dashboard"]
        init["init.js<br/>Project scaffolding"]
    end

    subgraph core["core/"]
        generator["generator.js<br/>Claude Code subprocess<br/>stream-json parsing<br/>size-aware prompts"]
        claudeApi["claude-api.js<br/>Dual engine: SDK + CLI<br/>batchAsk parallelism"]
        scanner["scanner.js<br/>Directory walker<br/>file grouping<br/>prompt builder"]
        specReader["spec-reader.js<br/>Spec/steering/map reader<br/>task parser"]
        gitChanges["git-changes.js<br/>Diff snapshots<br/>affected dir detection"]
        progress["progress.js<br/>Ora spinner + tool-call display"]
    end

    cli --> create & document & execute & status & refresh & arch
    cli -.->|lazy import| init

    create --> generator & specReader
    document --> scanner & claudeApi
    execute --> generator & specReader & gitChanges
    execute --> refresh
    refresh --> claudeApi & specReader
    arch --> specReader & generator
    init --> claudeApi & specReader

    generator --> progress
    claudeApi --> progress
```

---

### SECTION: SUMMARY
{
  "system_name": "sdd-kit",
  "description": "Spec-Driven Development Kit for Claude Code — a CLI tool that generates, executes, and tracks feature specs using AI, with living documentation that stays in sync via git-diff-triggered refresh.",
  "components": [
    { "name": "cli.js", "type": "module", "description": "Commander.js entrypoint with bilingual help (EN/ES), subcommand routing, and flattened help display" },
    { "name": "spec/create.js", "type": "module", "description": "Generates feature spec files (requirements, design, tasks) from natural language descriptions via Claude Code" },
    { "name": "spec/document.js", "type": "module", "description": "Reverse-engineers existing source code into module specs via parallel per-directory analysis and synthesis" },
    { "name": "spec/execute.js", "type": "module", "description": "Executes the next pending task in a spec via Claude Code; triggers living-doc refresh on affected modules" },
    { "name": "spec/status.js", "type": "module", "description": "Renders a terminal progress dashboard with progress bars and task checklists — no AI calls" },
    { "name": "spec/refresh.js", "type": "module", "description": "Updates specs/_map/ living documentation for one or all directories; also exported for programmatic use" },
    { "name": "arch.js", "type": "module", "description": "Generates architecture.md with Mermaid diagrams and an HTML dashboard from all specs and steering docs" },
    { "name": "init.js", "type": "module", "description": "Scaffolds .claude/steering/ and specs/features/; optionally auto-generates steering docs; injects SDD block into CLAUDE.md" },
    { "name": "generator.js", "type": "service", "description": "Core AI integration via Claude Code CLI subprocess with stream-json output; size-aware prompt templates" },
    { "name": "claude-api.js", "type": "service", "description": "Dual-engine Claude client — auto-selects Anthropic SDK (fast, parallel) or CLI subprocess fallback; supports batching" },
    { "name": "scanner.js", "type": "service", "description": "Directory tree walker that groups files and builds batched analysis prompts for code-to-spec generation" },
    { "name": "spec-reader.js", "type": "service", "description": "Pure-function reader for all spec artifacts: feature specs, module maps, steering files, and task parsing" },
    { "name": "git-changes.js", "type": "service", "description": "Detects changed files via git diff before/after task execution; identifies affected module directories" },
    { "name": "progress.js", "type": "service", "description": "Creates an ora-spinner progress callback showing elapsed time and active Claude tool calls" },
    { "name": "Claude Code CLI", "type": "external", "description": "Anthropic Claude Code binary spawned as subprocess for spec generation and task execution" },
    { "name": "Anthropic SDK", "type": "external", "description": "@anthropic-ai/sdk for direct API calls — used by claude-api.js as the preferred fast engine" },
    { "name": "Git", "type": "external", "description": "Git binary used for diff snapshots and change detection in the living-docs refresh loop" }
  ],
  "features": [
    { "name": "Spec Creation", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Code Documentation", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Task Execution", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Living Docs Refresh", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Progress Dashboard", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Architecture Views", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Project Init + Steering", "status": "complete", "tasks_done": 0, "tasks_total": 0 },
    { "name": "Bilingual CLI (EN/ES)", "status": "complete", "tasks_done": 0, "tasks_total": 0 }
  ],
  "tech_stack": [
    "Node.js (ESM)",
    "Commander.js (CLI framework)",
    "@anthropic-ai/sdk (Claude API)",
    "Claude Code CLI (subprocess)",
    "chalk (terminal colors)",
    "ora (spinners)",
    "Mermaid (architecture diagrams)",
    "Git (change detection)"
  ],
  "key_decisions": [
    "Dual AI engine — SDK for speed/parallelism, CLI subprocess as fallback; auto-detected at runtime",
    "promptOnly fallback — every AI command degrades gracefully to a saved markdown prompt file",
    "Living docs loop — execute.js uses git diff post-task to auto-refresh only affected module specs",
    "Thin command layer — commands handle UX only (spinners, color), all logic lives in core/",
    "stream-json output — generator.js parses Claude Code tool calls incrementally for real-time progress",
    "Lazy loading — init.js is dynamically imported to avoid load cost unless invoked",
    "CLAUDECODE env cleanup — both claude-api.js and generator.js delete process.env.CLAUDECODE before spawning to bypass nested-session block"
  ]
}

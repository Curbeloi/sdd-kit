/**
 * generator.js
 * Invokes Claude Code CLI (`claude -p`) to generate specs and architecture.
 * Falls back to saving prompt files when claude CLI is not available.
 */

import fs from 'fs';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { debugLog } from './log.js';
import { getConfig } from './config.js';

const execFileAsync = promisify(execFile);

export const Mode = { CLAUDE: 'claude', PROMPT: 'prompt' };

// ─── Agentic CLI descriptors ─────────────────────────────────────────────────
// Each agentic CLI describes how to check availability and build its args.
// `claude` is the verified default; `opencode` is best-effort (verify the flags
// against an installed opencode — its `run` subcommand and --model flag).
export const AGENT_CLIS = {
  claude: {
    command: 'claude',
    versionArgs: ['--version'],
    parse: 'stream-json',
    buildArgs({ prompt, model, allowedTools = 'Read,Write,Glob,Grep', maxBudget }) {
      const args = ['-p', prompt, '--allowedTools', allowedTools, '--output-format', 'stream-json', '--verbose'];
      if (model) args.push('--model', model);          // empty = inherit Claude Code default
      if (maxBudget) args.push('--max-budget-usd', String(maxBudget));
      return args;
    },
  },
  opencode: {
    command: 'opencode',
    versionArgs: ['--version'],
    parse: 'opencode-json',
    // `opencode run [message..]` — prompt is positional; -m/--model takes a
    // provider/model value (e.g. "anthropic/claude-sonnet-4-6"). `--format json`
    // emits line-delimited events (parsed defensively below). Permissions are
    // skipped so it runs autonomously (the analog of claude's --allowedTools).
    buildArgs({ prompt, model }) {
      const args = ['run', prompt, '--format', 'json', '--dangerously-skip-permissions'];
      if (model) args.push('--model', model);
      return args;
    },
  },
};

function getAgentCli(cwd) {
  const { agentCli } = getConfig(cwd);
  return AGENT_CLIS[agentCli] || AGENT_CLIS.claude;
}

/**
 * Map one opencode `--format json` event to a normalized update (pure; exported
 * for testing). Returns null for events we don't surface. Defensive against
 * schema drift — unknown shapes simply yield null.
 * @returns {null | {kind:'text', id:string, text:string} | {kind:'tool', name:string, detail:string} | {kind:'thinking'} | {kind:'cost', cost:number}}
 */
export function parseOpencodeEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'message.part.updated' && event.part) {
    const part = event.part;
    if (part.type === 'text' && typeof part.text === 'string') {
      return { kind: 'text', id: part.id || 'text', text: part.text };
    }
    if (part.type === 'tool') {
      const input = part.input || {};
      const detail = part.state || input.file_path || input.path || input.pattern || '';
      return { kind: 'tool', name: part.name || part.tool || 'tool', detail: String(detail) };
    }
    if (part.type === 'thinking') return { kind: 'thinking' };
    return null;
  }
  if (event.type === 'step-finish' || event.type === 'step_finish') {
    if (typeof event.cost === 'number') return { kind: 'cost', cost: event.cost };
  }
  return null;
}

// ─── Agentic CLI detection ───────────────────────────────────────────────────

const _cliAvailable = {}; // command -> boolean

async function isAgentCliAvailable(descriptor) {
  if (_cliAvailable[descriptor.command] !== undefined) return _cliAvailable[descriptor.command];
  try {
    await execFileAsync(descriptor.command, descriptor.versionArgs, { timeout: 5000 });
    _cliAvailable[descriptor.command] = true;
  } catch (err) {
    debugLog('generator', `${descriptor.command} CLI not available: ${err.message}`);
    _cliAvailable[descriptor.command] = false;
  }
  return _cliAvailable[descriptor.command];
}

export async function detectMode(promptOnly = false, cwd = process.cwd()) {
  if (promptOnly) return Mode.PROMPT;
  const descriptor = getAgentCli(cwd);
  return (await isAgentCliAvailable(descriptor)) ? Mode.CLAUDE : Mode.PROMPT;
}

// ─── Agentic CLI caller ──────────────────────────────────────────────────────

async function callAgentCli(prompt, { cwd, allowedTools = 'Read,Write,Glob,Grep', maxBudget, onProgress } = {}) {
  const descriptor = getAgentCli(cwd);
  const { agentModel } = getConfig(cwd);
  const args = descriptor.buildArgs({ prompt, model: agentModel, allowedTools, maxBudget });

  const debug = process.env.SDD_DEBUG === '1';

  return new Promise((resolve, reject) => {
    // Remove CLAUDECODE env var to avoid "nested session" block
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const proc = spawn(descriptor.command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let fullOutput = '';
    let lastText = '';
    let buffer = '';
    let rawStdout = '';
    let lastCost;
    const opencodeTexts = new Map(); // part id -> latest text

    // Claude Code stream-json: content blocks with text + tool_use.
    const handleClaudeEvent = (event) => {
      const content = event.message?.content || event.content;
      if (content && Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') lastText += block.text;
          if (block.type === 'tool_use' && onProgress) {
            const tool = block.name;
            const input = block.input || {};
            let detail = '';
            if (tool === 'Read' || tool === 'Write' || tool === 'Edit') detail = input.file_path || '';
            else if (tool === 'Glob' || tool === 'Grep') detail = input.pattern || '';
            else if (tool === 'Bash') detail = (input.command || '').slice(0, 60);
            onProgress({ tool, detail });
          }
        }
      }
      if (event.type === 'result') {
        fullOutput = lastText || (event.result || '');
        if (onProgress && (event.cost_usd || event.cost)) onProgress({ done: true, cost: event.cost_usd || event.cost });
      }
    };

    // opencode --format json: message.part.updated (tool|text|thinking) + step-finish.
    // Defensive: schema may evolve and the final step event isn't guaranteed, so the
    // output is resolved from accumulated text parts at process close, not on an event.
    const handleOpencodeEvent = (event) => {
      const u = parseOpencodeEvent(event);
      if (!u) return;
      if (u.kind === 'text') opencodeTexts.set(u.id, u.text);
      else if (u.kind === 'tool' && onProgress) onProgress({ tool: u.name, detail: u.detail });
      else if (u.kind === 'thinking' && onProgress) onProgress({ tool: 'thinking', detail: '' });
      else if (u.kind === 'cost') lastCost = u.cost;
    };

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      rawStdout += text;
      if (descriptor.parse === 'text') return; // collect raw stdout only

      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); }
        catch { debugLog('generator', `Non-JSON line from ${descriptor.command}: ${line.slice(0, 80)}`); continue; }
        if (debug) fs.appendFileSync('/tmp/sdd-debug.jsonl', line + '\n');
        if (descriptor.parse === 'opencode-json') handleOpencodeEvent(event);
        else handleClaudeEvent(event); // stream-json
      }
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${descriptor.command} failed (exit ${code}): ${stderr || 'unknown error'}`));
        return;
      }
      if (descriptor.parse === 'stream-json') {
        resolve(fullOutput);
      } else if (descriptor.parse === 'opencode-json') {
        if (onProgress) onProgress({ done: true, cost: lastCost });
        const joined = [...opencodeTexts.values()].join('').trim();
        resolve(joined || rawStdout.trim());
      } else {
        if (onProgress) onProgress({ done: true });
        resolve(rawStdout.trim());
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`${descriptor.command} failed: ${err.message}`));
    });

    // 10 min timeout
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${descriptor.command} timed out (10 min)`));
    }, 600000);
  });
}

// ─── Size-aware prompts ──────────────────────────────────────────────────────

const SIZE_INSTRUCTIONS = {
  small: {
    files: ['tasks.md'],
    prompt: (specName, description) => `Create a tasks.md file for this small change.

Feature: ${description}

Write the file to specs/features/${specName}/tasks.md

Rules:
- Max 5 tasks, each < 30 min
- Be specific: include file paths, function names
- No requirements or design doc — just tasks
- IMPORTANT: Task descriptions must be plain text — do NOT use backticks in the description. Only use a single backtick-quoted value at the end for the file path.

Format:
# Tasks: [title]

## Context
[one sentence]

## Tasks
- [ ] **1.1** Description without backticks in the text \`path/to/file\`
`,
  },

  medium: {
    files: ['requirements.md', 'tasks.md'],
    prompt: (specName, description) => `Create a requirements.md and tasks.md for this feature.

Feature: ${description}

Write files to specs/features/${specName}/

First, create requirements.md:
# Requirements: [title]

## Problem
[one paragraph]

## User Stories
- As a [user], I want to [action], so that [benefit]

## Acceptance Criteria
1. WHEN [condition] THEN the system SHALL [behavior]

Then, create tasks.md:
Ordered atomic tasks. Max 8 total. Each < 2 hours.
IMPORTANT: Task descriptions must be plain text — do NOT use backticks in the description. Only use a single backtick-quoted value at the end for the file path.
- [ ] **1.1** Description \`path/to/file\` <- AC 1
`,
  },

  large: {
    files: ['requirements.md', 'design.md', 'tasks.md'],
    prompt: (specName, description) => `Create a full SDD spec (requirements.md, design.md, tasks.md) for this feature.

Feature: ${description}

Write all files to specs/features/${specName}/

1. requirements.md:
# Requirements: [title]
## Introduction
## User Stories
## Requirements (with Acceptance Criteria per requirement)

2. design.md:
# Design: [title]
## Architecture Overview (include a mermaid diagram)
## Components
## Data Models
## API Contracts
## Key Decisions

3. tasks.md:
Grouped by phase: Setup > Core Logic > API Layer > Tests
IMPORTANT: Task descriptions must be plain text — do NOT use backticks in the description. Only use a single backtick-quoted value at the end for the file path.
- [ ] **1.1** Description \`path/to/file\` <- Req 1.1
`,
  },
};

// ─── Document (reverse engineer) ────────────────────────────────────────────

const DOCUMENT_PROMPT = (source, specName) => `Reverse engineer the code at ${source} into a spec.

Read the source files, understand what they do, and create specs/${specName}.spec.md

The spec should describe what EXISTS (not what should be built). Use this format:

# Spec: [Title]

## Purpose
What this module/service does.

## Capabilities
- Bullet list of what it does

## Interface
Key public APIs, functions, endpoints exposed to other parts of the system.

## Dependencies
What this depends on.

## Notes
Anything important about implementation choices.
`;

// ─── Architecture ─────────────────────────────────────────────────────────

function buildArchPrompt({ moduleSpecs, steering, featureSpecs }) {
  const parts = [];

  parts.push('Analyze the following project documentation and generate architecture views.\n');

  // Module specs (living documentation per directory)
  if (moduleSpecs && Object.keys(moduleSpecs).length) {
    parts.push('## Module Specs (per-directory analysis)\n');
    for (const [name, content] of Object.entries(moduleSpecs)) {
      parts.push(`### Module: ${name}\n${content.slice(0, 3000)}\n`);
    }
  }

  // Steering docs
  if (steering && Object.keys(steering).length) {
    parts.push('## Steering Documents\n');
    for (const [name, content] of Object.entries(steering)) {
      parts.push(`### ${name}\n${content.slice(0, 2000)}\n`);
    }
  }

  // Feature specs
  if (featureSpecs && featureSpecs.length) {
    parts.push('## Feature Specs\n');
    for (const spec of featureSpecs) {
      parts.push(`### Feature: ${spec.name}`);
      if (spec.files.requirements) parts.push(spec.files.requirements.slice(0, 1500));
      if (spec.files.design) parts.push(spec.files.design.slice(0, 1500));
      const done = spec.tasks.filter(t => t.done).length;
      parts.push(`Tasks: ${done}/${spec.tasks.length} complete\n`);
    }
  }

  parts.push(`---

Based on the documentation above, create specs/_arch/architecture.md with Mermaid diagrams.

Use these exact section headers:

### SECTION: OVERVIEW
\`\`\`mermaid
graph TD
  [System-level components and relationships]
\`\`\`

### SECTION: SERVICES
\`\`\`mermaid
graph LR
  [Service-to-service relationships and data flow]
\`\`\`

### SECTION: FLOWS
For each major feature or data flow:
#### Flow: {feature-name}
\`\`\`mermaid
sequenceDiagram
  [participants and interactions]
\`\`\`

### SECTION: MODULES
\`\`\`mermaid
graph TD
  [Module/component breakdown]
\`\`\`

### SECTION: SUMMARY
A JSON object (no markdown fences):
{
  "system_name": "string",
  "description": "string",
  "components": [{"name": "string", "type": "service|module|store|external", "description": "string"}],
  "features": [{"name": "string", "status": "complete|in-progress|planned", "tasks_done": 0, "tasks_total": 0}],
  "tech_stack": ["string"],
  "key_decisions": ["string"]
}
`);

  return parts.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function generateCreateSpec({ description, specName, size, projectContext, promptOnly, cwd, onProgress }) {
  const mode = await detectMode(promptOnly, cwd);
  const sizeConfig = SIZE_INSTRUCTIONS[size] || SIZE_INSTRUCTIONS.large;
  const basePrompt = sizeConfig.prompt(specName, description);
  const contextBlock = projectContext
    ? `\nProject context (from .claude/steering/):\n${projectContext}\n\nUse this context to make the spec specific to this project.`
    : '';
  const fullPrompt = basePrompt + contextBlock;

  if (mode === Mode.CLAUDE) {
    await callAgentCli(fullPrompt, { cwd, allowedTools: 'Read,Write,Glob,Grep', maxBudget: 0.5, onProgress });
    return { mode, specName };
  }

  return { mode, prompt: fullPrompt, specName };
}

export async function generateDocumentSpec({ source, specName, promptOnly, cwd, onProgress }) {
  const mode = await detectMode(promptOnly, cwd);
  const prompt = DOCUMENT_PROMPT(source, specName);

  if (mode === Mode.CLAUDE) {
    await callAgentCli(prompt, { cwd, allowedTools: 'Read,Write,Glob,Grep', maxBudget: 0.5, onProgress });
    return { mode, specName };
  }

  return { mode, prompt, specName };
}

export async function generateArchitecture({ promptOnly, cwd, moduleSpecs, steering, featureSpecs, onProgress }) {
  const mode = await detectMode(promptOnly, cwd);
  const prompt = buildArchPrompt({ moduleSpecs, steering, featureSpecs });

  if (mode === Mode.CLAUDE) {
    const raw = await callAgentCli(prompt, { cwd, allowedTools: 'Read,Write,Glob,Grep', maxBudget: 1.0, onProgress });
    return { mode, raw };
  }

  return { mode, prompt };
}

export function generateExecutePrompt({ spec, task, requirements, design, moduleContext }) {
  const contextParts = [];
  if (requirements) contextParts.push(`## Requirements\n${requirements.slice(0, 1500)}`);
  if (design) contextParts.push(`## Design\n${design.slice(0, 1500)}`);
  if (moduleContext) contextParts.push(`## Module Specs (living documentation)\n${moduleContext.slice(0, 3000)}`);
  const context = contextParts.length ? `\n\n${contextParts.join('\n\n')}` : '';

  if (task) {
    return `Execute task ${task.id}: ${task.desc}${task.file ? ` in \`${task.file}\`` : ''}.
${context}
When done, mark it complete in tasks.md: change \`[ ]\` to \`[x]\` for task ${task.id}.`;
  }

  return `Find the first unchecked task in specs/features/${spec.name}/tasks.md and implement it.
${context}
When done, mark it \`[x]\` in tasks.md.`;
}

export async function executeTask({ prompt, promptOnly, cwd, onProgress }) {
  const mode = await detectMode(promptOnly, cwd);

  if (mode === Mode.CLAUDE) {
    await callAgentCli(prompt, { cwd, allowedTools: 'Read,Write,Edit,Glob,Grep,Bash', onProgress });
    return { mode };
  }

  return { mode, prompt };
}

// ─── Arch parsing (used when Claude writes architecture.md directly) ─────

export function parseArchSections(raw) {
  const sections = { overview: '', services: '', flows: {}, modules: '', summary: null };
  let current = null;
  let flowName = null;
  const buffer = [];

  const flush = () => {
    if (!current) return;
    // Strip mermaid fences: ```mermaid ... ```
    const content = buffer.join('\n').trim()
      .replace(/^```mermaid\s*/gm, '')
      .replace(/^```\s*$/gm, '')
      .replace(/^graph\s+(TD|TB|BT|LR|RL)/gm, 'flowchart $1')
      .trim();
    if (current === 'FLOWS' && flowName) sections.flows[flowName] = content;
    else if (current === 'SUMMARY') {
      try { sections.summary = JSON.parse(content.replace(/```json|```/g, '').trim()); } catch (err) { debugLog('generator', `Failed to parse arch summary JSON: ${err.message}`); }
    }
    else if (current !== 'FLOWS') sections[current.toLowerCase()] = content;
    buffer.length = 0;
  };

  for (const line of raw.split('\n')) {
    const sectionMatch = line.match(/^###\s+SECTION:\s+(\w+)/i);
    const flowMatch = line.match(/^####\s+Flow:\s+(.+)/i);

    if (sectionMatch) {
      flush();
      current = sectionMatch[1].toUpperCase();
      flowName = null;
    } else if (flowMatch && current === 'FLOWS') {
      flush();
      flowName = flowMatch[1].trim();
    } else if (current) {
      buffer.push(line);
    }
    // Lines before first section are ignored (e.g. H1 title)
  }
  flush();

  return sections;
}

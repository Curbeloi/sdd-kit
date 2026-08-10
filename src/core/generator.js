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
import { buildArchPrompt } from './arch-prompt.js';

const execFileAsync = promisify(execFile);

export const Mode = { CLAUDE: 'claude', PROMPT: 'prompt' };

// ─── Agentic CLI descriptors ─────────────────────────────────────────────────
// Each agentic CLI describes how to check availability and build its args.
// `claude` is the verified default; `opencode` is best-effort (verify the flags
// against an installed opencode — its `run` subcommand and --model flag).
//
// `promptVia` says where the prompt goes: 'stdin' or 'argv'. An arch prompt for
// a large repo is hundreds of KB and argv is capped (ARG_MAX ≈ 1 MB on macOS
// and Linux, shared with the environment), so passing it as `-p <prompt>` fails
// with E2BIG on exactly the repos that need it most.
export const AGENT_CLIS = {
  claude: {
    command: 'claude',
    versionArgs: ['--version'],
    parse: 'stream-json',
    promptVia: 'stdin',   // `-p` with no value reads the prompt from stdin
    buildArgs({ model, allowedTools = 'Read,Write,Glob,Grep', maxBudget }) {
      const args = ['-p', '--allowedTools', allowedTools, '--output-format', 'stream-json', '--verbose'];
      if (model) args.push('--model', model);          // empty = inherit Claude Code default
      if (maxBudget) args.push('--max-budget-usd', String(maxBudget));
      return args;
    },
  },
  opencode: {
    command: 'opencode',
    versionArgs: ['--version'],
    parse: 'opencode-json',
    promptVia: 'argv',
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

// Roughly: anything the API says when the request itself was too big to accept.
const PROMPT_TOO_LONG_RE =
  /prompt is too long|too many tokens|request_too_large|maximum context length|context (?:length|window|limit) exceeded|exceeds? the (?:maximum )?(?:context|token)/i;

// The agentic CLI stopped because it ran out of spend, not because of the input.
const BUDGET_EXHAUSTED_RE = /maximum budget|budget_exhausted|error_max_budget/i;

/**
 * Pull a usable error message out of a failed agentic CLI run.
 *
 * Claude Code reports API failures as JSON on *stdout* and leaves stderr empty,
 * so the old `stderr || 'unknown error'` reported nothing at all. Scans the
 * stream for the two places a real message shows up — the final `result` event
 * and inline `is_api_error_message` assistant turns — and falls back to raw
 * output only when neither is present.
 *
 * @param {string} stdout - raw stdout (line-delimited JSON, possibly partial)
 * @param {string} stderr
 * @returns {{message: string, promptTooLong: boolean, budgetExhausted: boolean}}
 */
export function extractAgentError(stdout = '', stderr = '') {
  const messages = [];

  for (const line of String(stdout).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(trimmed); } catch { continue; }

    if (event.type === 'result') {
      // { is_error: true, result: "Prompt is too long" }
      if (event.is_error && typeof event.result === 'string') messages.push(event.result);
      // { subtype: "error_max_budget_usd", errors: ["Reached maximum budget ($1)"] }
      if (Array.isArray(event.errors)) {
        for (const e of event.errors) if (typeof e === 'string' && e.trim()) messages.push(e);
      }
      // Last resort for this event: the machine-readable reason, so the message
      // never degrades into a dump of the raw JSON line.
      if (!messages.length && typeof event.subtype === 'string' && event.subtype.startsWith('error')) {
        messages.push(event.subtype);
      }
    }
    // Inline API error turn: { error: "invalid_request", is_api_error_message: true, ... }
    if (event.is_api_error_message || event.error) {
      const content = event.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) messages.push(block.text);
        }
      } else if (typeof event.error === 'string') {
        messages.push(event.error);
      }
    }
  }

  const err = String(stderr).trim();
  if (err) messages.push(err);

  // Nothing structured — surface the tail of whatever was printed.
  if (!messages.length) {
    const tail = String(stdout).trim().slice(-400);
    if (tail) messages.push(tail);
  }

  const unique = [...new Set(messages.map(m => m.trim()).filter(Boolean))];
  const message = unique.join(' — ') || 'no output on stdout or stderr';
  return {
    message,
    promptTooLong: PROMPT_TOO_LONG_RE.test(message),
    budgetExhausted: BUDGET_EXHAUSTED_RE.test(message),
  };
}

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

const AGENT_TIMEOUT_MS = 600000;   // 10 min
const KILL_GRACE_MS = 5000;

async function callAgentCli(prompt, { cwd, allowedTools = 'Read,Write,Glob,Grep', maxBudget, onProgress } = {}) {
  const descriptor = getAgentCli(cwd);
  const { agentModel } = getConfig(cwd);
  const viaStdin = descriptor.promptVia === 'stdin';
  const args = descriptor.buildArgs({ prompt, model: agentModel, allowedTools, maxBudget });

  const debug = process.env.SDD_DEBUG === '1';

  return new Promise((resolve, reject) => {
    // Remove CLAUDECODE env var to avoid "nested session" block
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const proc = spawn(descriptor.command, args, {
      cwd,
      env,
      stdio: [viaStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    // Every exit path funnels through here so no handle outlives the call:
    // a live timer or an undrained pipe keeps the event loop — and therefore
    // the whole CLI — alive long after the command has printed its result.
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      for (const stream of [proc.stdin, proc.stdout, proc.stderr]) {
        if (stream && !stream.destroyed) stream.destroy();
      }
      proc.removeAllListeners();
      // An 'error' with no listener throws. Node emits one when a kill fails,
      // which is exactly what the next lines might do.
      proc.on('error', (err) => debugLog('generator', `post-settle child error: ${err.message}`));
      // Sole owner of termination, so the escalation actually gets its grace
      // period. Only reached when we settle early (timeout); a normal close has
      // already set exitCode.
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGTERM');
        const killTimer = setTimeout(() => proc.kill('SIGKILL'), KILL_GRACE_MS);
        killTimer.unref();
      }
      proc.unref();   // a lingering child must not hold the CLI open
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      // Always release the progress heartbeat, whatever happened. Callers wire
      // this to an interval-driven spinner; if `done` never arrives the interval
      // never clears and the process hangs on success.
      if (onProgress) { try { onProgress({ done: true, cost: lastCost }); } catch { /* display only */ } }
      cleanup();
      fn(value);
    };

    if (viaStdin) {
      // A dead child turns this write into EPIPE; the close/error handler owns
      // the failure, so swallow it here rather than crashing the CLI.
      proc.stdin.on('error', (err) => debugLog('generator', `stdin write failed: ${err.message}`));
      proc.stdin.end(prompt, 'utf-8');
    }

    let fullOutput = '';
    let lastText = '';
    let buffer = '';
    let rawStdout = '';
    let lastCost;
    let sawApiError = false;
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
        // Claude Code names this `total_cost_usd`; the older aliases are kept as
        // fallbacks. Completion itself is signalled from `settle()` on close —
        // never from here, since a result event without a cost field used to
        // mean the spinner's heartbeat interval was never cleared.
        const cost = event.total_cost_usd ?? event.cost_usd ?? event.cost;
        if (typeof cost === 'number') lastCost = cost;
        if (event.is_error) sawApiError = true;
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
      const failed = code !== 0 || (sawApiError && !fullOutput);
      if (failed) {
        const { message, promptTooLong, budgetExhausted } = extractAgentError(rawStdout, stderr);
        const err = new Error(`${descriptor.command} failed (exit ${code}): ${message}`);
        if (promptTooLong) err.code = 'PROMPT_TOO_LONG';
        else if (budgetExhausted) err.code = 'BUDGET_EXHAUSTED';
        settle(reject, err);
        return;
      }
      if (descriptor.parse === 'stream-json') {
        settle(resolve, fullOutput);
      } else if (descriptor.parse === 'opencode-json') {
        const joined = [...opencodeTexts.values()].join('').trim();
        settle(resolve, joined || rawStdout.trim());
      } else {
        settle(resolve, rawStdout.trim());
      }
    });

    proc.on('error', (err) => {
      settle(reject, new Error(`${descriptor.command} failed: ${err.message}`));
    });

    // cleanup() terminates the child (SIGTERM, escalating to SIGKILL).
    timer = setTimeout(() => {
      settle(reject, new Error(`${descriptor.command} timed out (${AGENT_TIMEOUT_MS / 60000} min)`));
    }, AGENT_TIMEOUT_MS);
    timer.unref();   // the child's own handle keeps the loop alive while it runs
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

export async function generateArchitecture({ promptOnly, cwd, moduleSpecs, steering, featureSpecs, level, flow, onProgress }) {
  const mode = await detectMode(promptOnly, cwd);
  const { archMaxPromptChars, specsDir, agentMaxBudgetUsd } = getConfig(cwd);
  const { prompt, stats } = buildArchPrompt({
    moduleSpecs, steering, featureSpecs,
    budget: archMaxPromptChars,
    specsDir,
    level, flow,
  });

  if (mode === Mode.CLAUDE) {
    const raw = await callAgentCli(prompt, { cwd, allowedTools: 'Read,Write,Glob,Grep', maxBudget: agentMaxBudgetUsd, onProgress });
    return { mode, raw, stats };
  }

  return { mode, prompt, stats };
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

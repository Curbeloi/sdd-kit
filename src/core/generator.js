/**
 * generator.js
 * Calls Claude API directly OR generates prompts for Claude Code.
 * Entirely driven by spec content — no language-specific parsing.
 */

import Anthropic from '@anthropic-ai/sdk';

export const Mode = { API: 'api', PROMPT: 'prompt' };

export function detectMode(promptOnly = false) {
  if (promptOnly) return Mode.PROMPT;
  return process.env.ANTHROPIC_API_KEY ? Mode.API : Mode.PROMPT;
}

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Size-aware system prompts ────────────────────────────────────────────────

const PROMPTS = {
  small: `You are a senior developer. Generate ONLY a tasks.md for this small change.

Rules:
- Max 5 tasks, each < 30 min
- Be specific: include file paths, function names
- No requirements or design doc — just tasks

Output ONLY valid Markdown for tasks.md. Start with:
# Tasks: {title}

## Context
[one sentence]

## Tasks
- [ ] **1.1** Description \`path/to/file\`
`,

  medium: `You are a senior developer and architect. Generate TWO files.

### FILE 1: requirements.md
# Requirements: {title}

## Problem
[one paragraph]

## User Stories
- As a [user], I want to [action], so that [benefit]

## Acceptance Criteria
1. WHEN [condition] THEN the system SHALL [behavior]

### FILE 2: tasks.md
Ordered atomic tasks. Max 8 total. Each < 2 hours.
- [ ] **1.1** Description \`path/to/file\` ← AC 1

Separate files clearly with "### FILE 1:" and "### FILE 2:" headers.
`,

  large: `You are a senior developer and architect. Generate THREE files.

### FILE 1: requirements.md
# Requirements: {title}

## Introduction
## User Stories
## Requirements (with Acceptance Criteria per requirement)

### FILE 2: design.md
# Design: {title}

## Architecture Overview
\`\`\`mermaid
graph TD
  [relevant components]
\`\`\`

## Components
## Data Models
## API Contracts
## Key Decisions

### FILE 3: tasks.md
Grouped by phase: Setup → Core Logic → API Layer → Tests
- [ ] **1.1** Description \`path/to/file\` ← Req 1.1

Separate with "### FILE 1:", "### FILE 2:", "### FILE 3:" headers.
`,
};

// ─── Document (reverse engineer) ────────────────────────────────────────────

const DOCUMENT_PROMPT = `You are a senior software architect.
Analyze this project file list and generate a spec that describes what exists.

Output a SINGLE spec.md file:

---
@describe
name: {name}
source: {source}
---

# Spec: {Title}

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

const ARCH_PROMPT = `You are a software architect. Analyze these project specs and generate a comprehensive architecture view.

Output EXACTLY this structure (use the exact headers):

### SECTION: OVERVIEW
\`\`\`mermaid
graph TD
  [System-level components and their relationships]
  [Include: main services, data stores, external integrations]
  [Use subgraphs for logical groupings]
\`\`\`

### SECTION: SERVICES
\`\`\`mermaid
graph LR
  [Service-to-service relationships and data flow]
  [Each feature as a node, dependencies as edges]
\`\`\`

### SECTION: FLOWS
For each major feature, a sequence diagram:

#### Flow: {feature-name}
\`\`\`mermaid
sequenceDiagram
  [participants and interactions for this feature]
\`\`\`

### SECTION: MODULES
\`\`\`mermaid
graph TD
  [Module/component breakdown]
  [subgraph per domain/layer]
\`\`\`

### SECTION: SUMMARY
A JSON object (no markdown fences) with this exact shape:
{
  "system_name": "string",
  "description": "string (1-2 sentences)",
  "components": [{"name": "string", "type": "service|module|store|external", "description": "string"}],
  "features": [{"name": "string", "status": "complete|in-progress|planned", "tasks_done": 0, "tasks_total": 0}],
  "tech_stack": ["string"],
  "key_decisions": ["string"]
}
`;

// ─── API caller ───────────────────────────────────────────────────────────

async function callAPI(systemPrompt, userContent, maxTokens = 4096) {
  const response = await client().messages.create({
    model: 'claude-opus-4-5',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  return response.content[0].text;
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function generateCreateSpec({ description, specName, size, projectContext, promptOnly }) {
  const mode = detectMode(promptOnly);
  const sizePrompt = PROMPTS[size] || PROMPTS.large;
  const contextBlock = projectContext ? `\n\n## Project Context\n${projectContext}` : '';
  const userContent = `Feature: ${description}\nSpec name: ${specName}${contextBlock}`;

  if (mode === Mode.API) {
    const raw = await callAPI(sizePrompt, userContent);
    return { mode, files: parseMultiFileResponse(raw, size) };
  }

  const fileList = {
    small:  '1. `tasks.md`',
    medium: '1. `requirements.md`\n2. `tasks.md`',
    large:  '1. `requirements.md`\n2. `design.md`\n3. `tasks.md`',
  }[size];

  const approvalNote = size !== 'small'
    ? '\nWait for user approval of requirements.md before writing tasks.' : '';

  const prompt = buildClaudeCodePrompt({
    task: `Create a ${size} SDD spec for: ${description}`,
    context: projectContext,
    instructions: `Create these files in \`specs/features/${specName}/\`:\n${fileList}${approvalNote}`,
  });

  return { mode, files: { prompt } };
}

export async function generateDocumentSpec({ source, specName, fileList, promptOnly }) {
  const mode = detectMode(promptOnly);
  const userContent = `Source: ${source}\nSpec name: ${specName}\n\nFile list:\n${fileList}`;

  if (mode === Mode.API) {
    const raw = await callAPI(DOCUMENT_PROMPT, userContent, 2048);
    return { mode, files: { spec: raw } };
  }

  const prompt = buildClaudeCodePrompt({
    task: `Reverse engineer ${source} into a spec`,
    context: '',
    instructions: `Read the source files and create \`specs/${specName}.spec.md\` with @describe tag.`,
  });

  return { mode, files: { prompt } };
}

export async function generateArchitecture({ specs, steering, promptOnly }) {
  const mode = detectMode(promptOnly);

  // Build context from all specs
  const specsContext = specs.map(s => {
    const parts = [`## Feature: ${s.name}`];
    if (s.files.requirements) parts.push(`### Requirements\n${s.files.requirements.slice(0, 800)}`);
    if (s.files.design) parts.push(`### Design\n${s.files.design.slice(0, 800)}`);
    const done = s.tasks.filter(t => t.done).length;
    parts.push(`Tasks: ${done}/${s.tasks.length} done`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  const steeringContext = Object.entries(steering)
    .map(([k, v]) => `## ${k}.md\n${v.slice(0, 600)}`)
    .join('\n\n');

  const userContent = `${steeringContext}\n\n# Feature Specs\n${specsContext}`;

  if (mode === Mode.API) {
    const raw = await callAPI(ARCH_PROMPT, userContent, 6000);
    return { mode, raw };
  }

  const prompt = buildClaudeCodePrompt({
    task: 'Generate architecture documentation from specs',
    context: '',
    instructions: `Read all files in specs/ and .claude/steering/ then create:
1. \`specs/_arch/architecture.md\` — Mermaid diagrams (overview, services, flows, modules)
2. \`specs/_arch/dashboard.html\` — interactive HTML with rendered diagrams`,
  });

  return { mode, raw: prompt };
}

export function generateExecutePrompt({ spec, task, requirements, design }) {
  const contextParts = [];
  if (requirements) contextParts.push(`## Requirements\n${requirements.slice(0, 1500)}`);
  if (design) contextParts.push(`## Design\n${design.slice(0, 1500)}`);

  return buildClaudeCodePrompt({
    task: task
      ? `Execute task ${task.id}: ${task.desc}`
      : `Execute next pending task in spec: ${spec.name}`,
    context: contextParts.join('\n\n'),
    instructions: task
      ? `Implement task ${task.id}: ${task.desc}${task.file ? ` in \`${task.file}\`` : ''}.
When done, mark it complete in tasks.md: change \`[ ]\` to \`[x]\` for task ${task.id}.`
      : `Find the first unchecked task in specs/features/${spec.name}/tasks.md and implement it.
When done, mark it \`[x]\` in tasks.md.`,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildClaudeCodePrompt({ task, context, instructions }) {
  const parts = [`## SDD Task\n${task}`];
  if (context) parts.push(`## Context\n${context}`);
  parts.push(`## Instructions\n${instructions}`);
  parts.push('---\n*Generated by sdd-kit — https://github.com/icurbe/sdd-kit*');
  return parts.join('\n\n');
}

function parseMultiFileResponse(raw, size) {
  const fileKeys = { small: ['tasks'], medium: ['requirements', 'tasks'], large: ['requirements', 'design', 'tasks'] }[size];
  const result = {};
  let current = null;
  const buffer = [];

  for (const line of raw.split('\n')) {
    const lower = line.toLowerCase();
    let matched = null;
    for (const key of fileKeys) {
      if (lower.includes(`${key}.md`) || lower.includes(`## ${key}`) || lower.includes(`file ${fileKeys.indexOf(key) + 1}`)) {
        matched = key; break;
      }
    }
    if (matched) {
      if (current && buffer.length) result[current] = buffer.join('\n').trim();
      current = matched;
      buffer.length = 0;
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current && buffer.length) result[current] = buffer.join('\n').trim();

  // Fallback
  if (!Object.keys(result).length) result[fileKeys[0]] = raw.trim();
  return result;
}

export function parseArchSections(raw) {
  const sections = { overview: '', services: '', flows: {}, modules: '', summary: null };
  let current = null;
  let flowName = null;
  const buffer = [];

  const flush = () => {
    if (!current) return;
    const content = buffer.join('\n').trim();
    if (current === 'FLOWS' && flowName) sections.flows[flowName] = content;
    else if (current === 'SUMMARY') {
      try { sections.summary = JSON.parse(content.replace(/```json|```/g, '').trim()); } catch {}
    }
    else sections[current.toLowerCase()] = content;
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
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

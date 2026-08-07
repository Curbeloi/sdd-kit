/**
 * arch-prompt.js — Build the `sdd arch` prompt under a hard size budget.
 *
 * The whole spec corpus used to be concatenated into a single prompt. That
 * works at ~100 feature specs and dies at ~300: the request comes back
 * "Prompt is too long", and because the agentic CLI reports that on stdout
 * (not stderr) the user only ever saw `unknown error`.
 *
 * So the corpus is now *spent* against a character budget, in priority order:
 *
 *   1. steering docs — project-wide intent; small, always worth its space
 *   2. module specs  — the real architecture signal (one per directory)
 *   3. feature specs — many, individually low-signal; degraded as needed
 *
 * Feature specs degrade as a whole tier (full → summary → headline) so the
 * prompt stays internally consistent, and anything dropped is reported back to
 * the caller rather than silently vanishing. The agent keeps Read/Glob/Grep, so
 * the prompt tells it where the un-sent detail lives instead of pretending the
 * summary is the whole story.
 */

/** Default corpus budget in characters (~75k tokens). Override with `arch_max_prompt_chars`. */
export const DEFAULT_ARCH_PROMPT_BUDGET = 300_000;

/** Rough chars-per-token used only for human-facing estimates. */
const CHARS_PER_TOKEN = 4;

const PER_MODULE_CHARS = 3000;
const PER_STEERING_CHARS = 2000;
const MIN_PER_MODULE_CHARS = 400;

// Share of the budget each tier may claim before it starts squeezing the next.
const STEERING_SHARE = 0.15;
const FEATURE_HEADLINE_RESERVE_SHARE = 0.25;

/** Feature detail levels, richest first. */
export const FEATURE_DETAIL_LEVELS = ['full', 'summary', 'headline'];

const FEATURE_LIMITS = {
  full:     { requirements: 1500, design: 1500 },
  summary:  { requirements: 400,  design: 0 },
  headline: { requirements: 0,    design: 0 },
};

/** Estimated tokens for a character count (rough — for reporting only). */
export function estimateTokens(chars) {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Slice `text` to `max` chars, marking the cut so the model knows it is partial. */
function clip(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

/**
 * First meaningful prose from a spec body: skips frontmatter, the H1 title and
 * blank lines, so a `summary` slice carries content instead of boilerplate.
 */
function firstMeaningfulChunk(text, max) {
  if (!text) return '';
  const body = String(text)
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')  // frontmatter
    .replace(/^#\s+.*$/m, '')                        // H1 title
    .trim();
  return clip(body, max);
}

function taskLine(spec) {
  const total = spec.tasks?.length || 0;
  const done = spec.tasks?.filter(t => t.done).length || 0;
  return `Tasks: ${done}/${total} complete`;
}

// ─── Tier rendering ──────────────────────────────────────────────────────────

function renderSteering(steering, perFile) {
  const entries = Object.entries(steering || {});
  if (!entries.length) return '';
  const parts = ['## Steering Documents\n'];
  for (const [name, content] of entries) {
    parts.push(`### ${name}\n${clip(content, perFile)}\n`);
  }
  return parts.join('\n');
}

function renderModules(moduleSpecs, perModule) {
  const entries = Object.entries(moduleSpecs || {});
  if (!entries.length) return '';
  const parts = ['## Module Specs (per-directory analysis)\n'];
  for (const [name, content] of entries) {
    parts.push(`### Module: ${name}\n${clip(content, perModule)}\n`);
  }
  return parts.join('\n');
}

function renderFeatures(specs, level) {
  if (!specs.length) return '';
  const limits = FEATURE_LIMITS[level];

  if (level === 'headline') {
    const parts = ['## Feature Specs (names and progress only)\n'];
    for (const spec of specs) parts.push(`- ${spec.name} — ${taskLine(spec)}`);
    return parts.join('\n') + '\n';
  }

  const parts = ['## Feature Specs\n'];
  for (const spec of specs) {
    parts.push(`### Feature: ${spec.name}`);
    const req = spec.files?.requirements;
    const design = spec.files?.design;
    if (req && limits.requirements) {
      parts.push(level === 'summary'
        ? firstMeaningfulChunk(req, limits.requirements)
        : clip(req, limits.requirements));
    }
    if (design && limits.design) parts.push(clip(design, limits.design));
    parts.push(`${taskLine(spec)}\n`);
  }
  return parts.join('\n');
}

// ─── Instructions ────────────────────────────────────────────────────────────

function instructions({ degraded, omitted, specsDir }) {
  const caveat = degraded
    ? `
NOTE ON INPUT COMPLETENESS
The feature specs above were condensed to fit this prompt${omitted ? `, and ${omitted} of them are listed by name only` : ''}.
Full specs live on disk under ${specsDir}/*/ — if a specific feature matters to the
architecture and the summary above is not enough, Read that spec directly before
describing it. Do not invent components you cannot substantiate.
`
    : '';

  return `---
${caveat}
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
`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the architecture prompt, trimming the corpus to fit `budget` characters.
 *
 * Feature specs are ordered most-recently-modified first, so when the tier is
 * truncated the freshest work survives.
 *
 * @param {object}   opts
 * @param {object}   [opts.moduleSpecs]  - { name: content }
 * @param {object}   [opts.steering]     - { name: content }
 * @param {object[]} [opts.featureSpecs] - specs from readAllSpecs()
 * @param {number}   [opts.budget]       - max prompt characters
 * @param {string}   [opts.specsDir]     - where full feature specs live (for the caveat)
 * @returns {{prompt: string, stats: object}}
 */
export function buildArchPrompt({
  moduleSpecs = {},
  steering = {},
  featureSpecs = [],
  budget = DEFAULT_ARCH_PROMPT_BUDGET,
  specsDir = 'specs/features',
} = {}) {
  const header = 'Analyze the following project documentation and generate architecture views.\n';

  // Reserve space for the fixed instruction block up front (worst case: degraded).
  const footerReserve = instructions({ degraded: true, omitted: 9999, specsDir }).length;
  let remaining = Math.max(0, budget - header.length - footerReserve);

  // ── Tier 1: steering ──
  const steeringCount = Object.keys(steering).length;
  let steeringText = renderSteering(steering, PER_STEERING_CHARS);
  const steeringCap = Math.floor(remaining * STEERING_SHARE);
  if (steeringText.length > steeringCap && steeringCount > 0) {
    steeringText = renderSteering(steering, Math.max(200, Math.floor(steeringCap / steeringCount)));
  }
  remaining -= steeringText.length;

  // ── Tier 2: module specs (may squeeze features down to headlines, never below) ──
  const moduleCount = Object.keys(moduleSpecs).length;
  const headlineReserve = Math.min(
    renderFeatures(featureSpecs, 'headline').length,
    Math.floor(remaining * FEATURE_HEADLINE_RESERVE_SHARE),
  );
  const moduleCap = Math.max(0, remaining - headlineReserve);
  let perModule = PER_MODULE_CHARS;
  let moduleText = renderModules(moduleSpecs, perModule);
  if (moduleText.length > moduleCap && moduleCount > 0) {
    perModule = Math.max(MIN_PER_MODULE_CHARS, Math.floor(moduleCap / moduleCount));
    moduleText = renderModules(moduleSpecs, perModule);
  }
  remaining -= moduleText.length;

  // ── Tier 3: feature specs — richest level that fits, most recent first ──
  const ordered = [...featureSpecs].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  let level = 'headline';
  let included = ordered;
  let featureText = '';
  let omitted = 0;

  for (const candidate of FEATURE_DETAIL_LEVELS) {
    const text = renderFeatures(ordered, candidate);
    if (text.length <= remaining) {
      level = candidate;
      featureText = text;
      break;
    }
    // Nothing fits, not even headlines — keep the newest slice that does.
    if (candidate === 'headline') {
      let lo = 0;
      let hi = ordered.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (renderFeatures(ordered.slice(0, mid), 'headline').length <= remaining) lo = mid;
        else hi = mid - 1;
      }
      included = ordered.slice(0, lo);
      omitted = ordered.length - included.length;
      featureText = renderFeatures(included, 'headline');
    }
  }
  remaining -= featureText.length;

  const degraded = level !== 'full' || omitted > 0;
  const prompt = [
    header,
    steeringText,
    moduleText,
    featureText,
    instructions({ degraded, omitted, specsDir }),
  ].filter(Boolean).join('\n');

  return {
    prompt,
    stats: {
      chars: prompt.length,
      estTokens: estimateTokens(prompt.length),
      budget,
      degraded,
      featureDetail: level,
      moduleCount,
      steeringCount,
      featuresTotal: ordered.length,
      featuresIncluded: included.length,
      featuresOmitted: omitted,
      perModuleChars: moduleCount ? perModule : 0,
    },
  };
}

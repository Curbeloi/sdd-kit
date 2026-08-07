import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildArchPrompt, estimateTokens, DEFAULT_ARCH_PROMPT_BUDGET } from './arch-prompt.js';

function makeSpec(name, { req = '', design = '', done = 0, total = 0, mtime = 0 } = {}) {
  const tasks = Array.from({ length: total }, (_, i) => ({ done: i < done, id: `1.${i}`, desc: 'x', file: null }));
  return {
    name,
    dir: `specs/features/${name}`,
    files: { ...(req && { requirements: req }), ...(design && { design }) },
    tasks,
    tasksContent: '',
    mtime,
  };
}

function manySpecs(n, bodyChars = 4000) {
  return Array.from({ length: n }, (_, i) =>
    makeSpec(`feat-${String(i).padStart(3, '0')}`, {
      req: `# Requirements: feature ${i}\n\n${'lorem ipsum '.repeat(bodyChars / 12)}`,
      total: 3,
      done: 1,
      mtime: i,   // higher index = more recently touched
    }));
}

describe('buildArchPrompt — small corpus', () => {
  it('sends feature specs in full and reports no degradation', () => {
    const { prompt, stats } = buildArchPrompt({
      moduleSpecs: { 'src-core': 'core module does things' },
      steering: { product: 'we build a CLI' },
      featureSpecs: [makeSpec('feat-auth', { req: '# Requirements: auth\n\nJWT login flow', total: 2, done: 2 })],
    });

    assert.equal(stats.degraded, false);
    assert.equal(stats.featureDetail, 'full');
    assert.equal(stats.featuresOmitted, 0);
    assert.match(prompt, /JWT login flow/);
    assert.match(prompt, /core module does things/);
    assert.match(prompt, /we build a CLI/);
    assert.match(prompt, /Tasks: 2\/2 complete/);
  });

  it('always emits the section contract the parser expects', () => {
    const { prompt } = buildArchPrompt({ featureSpecs: [makeSpec('feat-a')] });
    for (const section of ['OVERVIEW', 'SERVICES', 'FLOWS', 'MODULES', 'SUMMARY']) {
      assert.ok(prompt.includes(`### SECTION: ${section}`), `missing SECTION: ${section}`);
    }
  });
});

describe('buildArchPrompt — corpus that used to blow the context', () => {
  // The reported failure: 332 feature specs concatenated whole, rejected with
  // "Prompt is too long". The prompt must now fit whatever budget it is given.
  it('stays within budget for a 332-spec corpus', () => {
    const { prompt, stats } = buildArchPrompt({
      moduleSpecs: Object.fromEntries(Array.from({ length: 34 }, (_, i) => [`mod-${i}`, 'x'.repeat(8000)])),
      steering: { product: 'y'.repeat(9000), tech: 'z'.repeat(9000), structure: 'w'.repeat(9000) },
      featureSpecs: manySpecs(332),
    });

    assert.ok(prompt.length <= DEFAULT_ARCH_PROMPT_BUDGET,
      `prompt ${prompt.length} exceeded budget ${DEFAULT_ARCH_PROMPT_BUDGET}`);
    assert.equal(stats.degraded, true);
    assert.equal(stats.featuresTotal, 332);
  });

  it('keeps module specs and steering even when features are squeezed out', () => {
    const { prompt } = buildArchPrompt({
      moduleSpecs: { 'src-core': 'THE-CORE-MODULE' },
      steering: { product: 'THE-PRODUCT-DOC' },
      featureSpecs: manySpecs(300),
      budget: 20000,
    });
    assert.match(prompt, /THE-CORE-MODULE/);
    assert.match(prompt, /THE-PRODUCT-DOC/);
  });

  it('degrades the feature tier as a whole rather than truncating mid-corpus', () => {
    const { stats } = buildArchPrompt({ featureSpecs: manySpecs(200), budget: 60000 });
    assert.ok(['summary', 'headline'].includes(stats.featureDetail));
    assert.equal(stats.featuresIncluded, 200, 'every spec should still be represented');
    assert.equal(stats.featuresOmitted, 0);
  });

  it('drops the oldest specs first when even headlines do not fit', () => {
    const specs = manySpecs(400);
    const { prompt, stats } = buildArchPrompt({ featureSpecs: specs, budget: 3000 });

    assert.ok(stats.featuresOmitted > 0, 'expected some specs to be omitted');
    assert.equal(stats.featuresIncluded + stats.featuresOmitted, 400);
    assert.ok(prompt.length <= 3000);
    // mtime ascends with the index, so the newest name must survive and the oldest must not.
    assert.match(prompt, /feat-399/);
    assert.ok(!prompt.includes('feat-000'), 'oldest spec should have been dropped');
  });

  it('tells the agent where the un-sent detail lives when degraded', () => {
    const { prompt } = buildArchPrompt({
      featureSpecs: manySpecs(300),
      budget: 40000,
      specsDir: 'specs/features',
    });
    assert.match(prompt, /NOTE ON INPUT COMPLETENESS/);
    assert.match(prompt, /specs\/features/);
    assert.match(prompt, /Do not invent components/);
  });

  it('never reports a degraded corpus as complete', () => {
    const { stats } = buildArchPrompt({ featureSpecs: manySpecs(300), budget: 40000 });
    assert.equal(stats.degraded, true);
  });
});

describe('estimateTokens', () => {
  it('approximates 4 characters per token', () => {
    assert.equal(estimateTokens(400), 100);
    assert.equal(estimateTokens(0), 0);
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { documentCmd } from './document.js';
import { buildSynthesisPrompt, buildDirectSpecPrompt } from '../../core/scanner.js';
import { resetConfig } from '../../core/config.js';
import { withTempDir } from '../../test-helpers.js';

beforeEach(() => resetConfig());

/** A project with a living map spec and a source dir to point `document` at. */
function scaffold(dir, { mapSpec = true } = {}) {
  const src = path.join(dir, 'app', 'agents', '_common');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'mcp_tools.py'), 'def resolve_allowed_tools():\n    pass\n');
  fs.writeFileSync(path.join(src, 'flow_tools.py'), 'def build_flow_tools():\n    pass\n');

  if (mapSpec) {
    const mapDir = path.join(dir, 'specs', '_map');
    fs.mkdirSync(mapDir, { recursive: true });
    fs.writeFileSync(
      path.join(mapDir, 'root.spec.md'),
      '---\nsource_hash: abc123\n---\n# root\n\nThe real project-wide map spec.\n'
    );
  }
  return src;
}

describe('spec document — prompt-only', () => {
  it('never claims an analysis that did not run', async () => {
    // The regression: savePromptOnly fed a bare file list into the SYNTHESIS
    // prompt, whose first line asserts every directory was already analyzed.
    // A model handed that writes the spec from filenames.
    await withTempDir(async (dir) => {
      scaffold(dir);
      await documentCmd({
        source: 'app/agents/_common',
        name: 'feat-mcp-tools',
        promptOnly: true,
        cwd: dir,
      });

      const promptPath = path.join(dir, 'specs', 'features', 'feat-mcp-tools', 'document_prompt.md');
      assert.ok(fs.existsSync(promptPath), 'prompt should land in the spec dir');
      const prompt = fs.readFileSync(promptPath, 'utf-8');

      assert.ok(!/You have analyzed/i.test(prompt), 'must not assert a prior analysis');
      assert.match(prompt, /Read all 2 files/);
      assert.match(prompt, /mcp_tools\.py/);
      assert.match(prompt, /flow_tools\.py/);
    });
  });

  it('writes no loose specs/<name>.spec.md orphan', async () => {
    await withTempDir(async (dir) => {
      scaffold(dir);
      await documentCmd({
        source: 'app/agents/_common',
        name: 'feat-mcp-tools',
        promptOnly: true,
        cwd: dir,
      });

      const loose = fs.readdirSync(path.join(dir, 'specs')).filter(f => f.endsWith('.spec.md'));
      assert.deepEqual(loose, [], 'specs/ root must hold directories, not spec files');
    });
  });
});

/** Stubbed engine — the real run's writes are what matter, not the model output. */
function fakeApi(unified = '# Spec: Fake\n\n## Purpose\nStub.\n') {
  return {
    detectEngine: () => 'stub',
    getEngineName: () => 'stub',
    askClaude: async () => unified,
    batchAsk: async (items, { onItemDone } = {}) =>
      items.map((item, i) => {
        const result = `# ${item.label}\n\nAnalysis of ${item.label}.\n`;
        if (onItemDone) onItemDone(item.label, result, i, null);
        return { label: item.label, result };
      }),
  };
}

describe('spec document — full run', () => {
  it('does not clobber the project map spec', async () => {
    // The regression that ate specs/_map/root.spec.md: per-directory analyses
    // were grouped relative to the TARGET, so a target whose files sit at its
    // own top level produced the label "root" and overwrote the project-wide
    // map spec that `spec refresh` owns.
    await withTempDir(async (dir) => {
      scaffold(dir);
      const mapPath = path.join(dir, 'specs', '_map', 'root.spec.md');
      const before = fs.readFileSync(mapPath, 'utf-8');

      await documentCmd({
        source: 'app/agents/_common',
        name: 'feat-mcp-tools',
        cwd: dir,
        api: fakeApi(),
      });

      assert.equal(fs.readFileSync(mapPath, 'utf-8'), before, 'map spec must survive untouched');
      assert.deepEqual(fs.readdirSync(path.join(dir, 'specs', '_map')), ['root.spec.md']);
    });
  });

  it('lands the spec in its own directory as design.md', async () => {
    await withTempDir(async (dir) => {
      scaffold(dir);
      await documentCmd({
        source: 'app/agents/_common',
        name: 'feat-mcp-tools',
        cwd: dir,
        api: fakeApi('# Spec: MCP tools\n\n## Purpose\nReal.\n'),
      });

      const designPath = path.join(dir, 'specs', 'features', 'feat-mcp-tools', 'design.md');
      assert.ok(fs.existsSync(designPath), 'expected specs/features/<name>/design.md');
      assert.match(fs.readFileSync(designPath, 'utf-8'), /## Purpose/);

      const loose = fs.readdirSync(path.join(dir, 'specs')).filter(f => f.endsWith('.spec.md'));
      assert.deepEqual(loose, []);
    });
  });

  it('feeds the synthesis the real analyses, not a file list', async () => {
    await withTempDir(async (dir) => {
      scaffold(dir);
      let synthPrompt = '';
      const api = fakeApi();
      api.askClaude = async (prompt) => { synthPrompt = prompt; return '# Spec: X\n'; };

      await documentCmd({
        source: 'app/agents/_common',
        name: 'feat-mcp-tools',
        cwd: dir,
        api,
      });

      // The "You have analyzed…" framing is only honest here, where the phase-2
      // analyses really are in the prompt.
      assert.match(synthPrompt, /You have analyzed/);
      assert.match(synthPrompt, /Analysis of root/);
    });
  });
});

describe('buildSynthesisPrompt', () => {
  it('does not instruct a write path — the caller owns the file', () => {
    // It used to hardcode "Create the file specs/<name>.spec.md", which both
    // contradicted the "return only markdown" instruction the caller appends
    // and named a location nothing reads.
    const prompt = buildSynthesisPrompt('feat-x', 'app/services', [
      { dir: 'root', content: '# root\n\nReal analysis text.\n' },
    ]);
    assert.ok(!/Create the file/i.test(prompt));
    assert.ok(!/specs\/feat-x\.spec\.md/.test(prompt));
    assert.match(prompt, /Real analysis text/);
  });
});

describe('buildDirectSpecPrompt', () => {
  it('lists every file and orders them read first', () => {
    const prompt = buildDirectSpecPrompt('feat-x', 'app/services', ['a.py', 'sub/b.py']);
    assert.match(prompt, /Read all 2 files/);
    assert.match(prompt, /- `a\.py`/);
    assert.match(prompt, /- `sub\/b\.py`/);
    assert.match(prompt, /Do not infer behaviour from a filename you have not opened/);
  });

  it('shares the output format with the synthesis prompt', () => {
    // Both must ask for the same spec shape, or --prompt-only quietly produces
    // a differently-structured document than a real run.
    const direct = buildDirectSpecPrompt('feat-x', 'src', ['a.py']);
    const synth = buildSynthesisPrompt('feat-x', 'src', [{ dir: 'root', content: 'x' }]);
    for (const heading of ['## Purpose', '## Architecture', '## Modules', '## Data Flow']) {
      assert.ok(direct.includes(heading), `direct prompt missing ${heading}`);
      assert.ok(synth.includes(heading), `synthesis prompt missing ${heading}`);
    }
  });
});

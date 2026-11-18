import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withTempDir, createMockSpec, sdd } from '../../test-helpers.js';

describe('sdd spec status <spec>', () => {
  // A checkbox line the parser drops is missing from the task list and from
  // the count, with nothing on screen to say why.
  it('shows, with its line number, a checkbox line that is not a task', async () => {
    await withTempDir(async (dir) => {
      createMockSpec(dir, 'feat-x', {
        tasks: '# Tasks\n\n- [ ] **1.1** ok\n* [ ] **1.2** star bullet\n',
      });
      const { code, stdout } = await sdd(['spec', 'status', 'feat-x'], { cwd: dir });
      assert.equal(code, 0);
      assert.match(stdout, /\b4\b[^\n]*\* \[ \] \*\*1\.2\*\* star bullet/);
    });
  });
});

/**
 * cli-detect.js — detect whether a CLI is available on PATH.
 *
 * Shared by `sdd doctor`, `sdd init` (skill file placement) and `sdd provider`.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * True if `<cmd> --version` runs without error (i.e. the CLI is on PATH).
 * @param {string} cmd
 * @returns {Promise<boolean>}
 */
export async function cliAvailable(cmd) {
  try {
    await execFileAsync(cmd, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

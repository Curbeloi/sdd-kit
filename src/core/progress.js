/**
 * progress.js — Live progress display for Claude Code operations.
 */

import chalk from 'chalk';

const TOOL_ICONS = {
  Read:  '  read',
  Write: ' write',
  Edit:  '  edit',
  Glob:  '  glob',
  Grep:  '  grep',
  Bash:  '  bash',
};

/**
 * Creates an onProgress callback that updates an ora spinner in real-time.
 * Shows elapsed time + tool activity.
 */
export function createProgress(spinner) {
  let steps = 0;
  const start = Date.now();
  const baseText = spinner.text;

  // Heartbeat: update elapsed time every second so spinner looks alive.
  //
  // `unref()` is load-bearing, not a micro-optimisation: this interval is
  // cosmetic, but a referenced one holds the event loop open forever if the
  // `done` event never arrives — which is exactly how `sdd arch` used to print
  // its full result and then hang indefinitely.
  const heartbeat = setInterval(() => {
    const elapsed = formatElapsed(Date.now() - start);
    if (steps === 0) {
      spinner.text = `${baseText} ${chalk.dim(elapsed)}`;
    } else {
      spinner.suffixText = chalk.dim(`[${steps}] ${elapsed}`);
    }
  }, 1000);
  heartbeat.unref();

  const progress = (event) => {
    if (event.done) {
      clearInterval(heartbeat);
      const elapsed = formatElapsed(Date.now() - start);
      const cost = typeof event.cost === 'number' ? `$${event.cost.toFixed(3)}` : '';
      spinner.suffixText = chalk.dim(`${cost} ${elapsed}`);
      return;
    }

    steps++;
    const icon = TOOL_ICONS[event.tool] || event.tool;
    const detail = event.detail ? chalk.dim(truncPath(event.detail)) : '';
    const elapsed = formatElapsed(Date.now() - start);

    spinner.text = `${chalk.blue(icon)} ${detail}`;
    spinner.suffixText = chalk.dim(`[${steps}] ${elapsed}`);
  };

  // Expose cleanup so callers can guarantee it in a `finally` — idempotent, so
  // stopping after a `done` event already fired is harmless.
  progress.stop = () => clearInterval(heartbeat);

  return progress;
}

function truncPath(p, max = 50) {
  if (p.length <= max) return p;
  return '...' + p.slice(-(max - 3));
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

/**
 * log.js — Debug logging utility.
 * Logs to stderr only when SDD_DEBUG=1 is set.
 */

import chalk from 'chalk';

const DEBUG = process.env.SDD_DEBUG === '1';

/**
 * Log a debug message to stderr. Only outputs when SDD_DEBUG=1.
 * @param {string} context - Where the log comes from (e.g. 'scanner', 'git-changes')
 * @param  {...any} args - Values to log
 */
export function debugLog(context, ...args) {
  if (!DEBUG) return;
  console.error(chalk.dim(`[sdd:${context}]`), ...args);
}

/**
 * Log a visible warning to stderr (always shown, not just in debug mode).
 * @param {string} msg
 */
export function warnLog(msg) {
  console.error(chalk.yellow(`  warn  ${msg}`));
}

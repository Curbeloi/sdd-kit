/**
 * sdd config — show active configuration
 */

import chalk from 'chalk';
import { getConfig, getDefaults } from '../core/config.js';

export function configCmd({ cwd = process.cwd() } = {}) {
  console.log(`\n${chalk.bold('sdd config')} — ${chalk.cyan('Active configuration')}\n`);

  const config = getConfig(cwd);
  const defaults = getDefaults();

  const display = [
    ['specs_dir',     config.specsDir,    defaults.specs_dir],
    ['modules_dir',   config.modulesDir,  defaults.modules_dir],
    ['steering_dir',  config.steeringDir, defaults.steering_dir],
    ['arch_dir',      config.archDir,     defaults.arch_dir],
    ['concurrency',   config.concurrency, defaults.concurrency],
    ['max_file_size', config.maxFileSize, defaults.max_file_size],
    ['max_depth',     config.maxDepth,    defaults.max_depth],
  ];

  for (const [key, value, defaultVal] of display) {
    const source = config._sources[key] || 'default';
    const valueStr = key === 'max_file_size' ? `${Math.round(value / 1024)}KB` : String(value);
    const sourceTag = source === '.sddrc' ? chalk.cyan(`(${source})`) : chalk.dim(`(${source})`);
    const changed = value !== defaultVal;
    const label = changed ? chalk.white(key) : chalk.dim(key);
    console.log(`  ${label.padEnd(30)} ${valueStr.padEnd(20)} ${sourceTag}`);
  }

  console.log('');
}

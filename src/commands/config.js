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
    ['arch_max_prompt_chars', config.archMaxPromptChars, defaults.arch_max_prompt_chars],
    // LLM provider (text-generation layer)
    ['provider',      config.provider,    defaults.provider],
    ['model',         config.model,       defaults.model],
    ['base_url',      config.baseUrl,     defaults.base_url],
    ['api_key_env',   config.apiKeyEnv,   defaults.api_key_env],
    // Agentic execution layer
    ['agent_cli',     config.agentCli,    defaults.agent_cli],
    ['agent_model',   config.agentModel,  defaults.agent_model],
    ['agent_max_budget_usd', config.agentMaxBudgetUsd, defaults.agent_max_budget_usd],
  ];

  for (const [key, value, defaultVal] of display) {
    const source = config._sources[key] || 'default';
    let valueStr;
    if (key === 'max_file_size') valueStr = `${Math.round(value / 1024)}KB`;
    else if (value === '') valueStr = chalk.dim('(unset)');
    else valueStr = String(value);
    const sourceTag = source === 'default' ? chalk.dim(`(${source})`) : chalk.cyan(`(${source})`);
    const changed = value !== defaultVal;
    const label = changed ? chalk.white(key) : chalk.dim(key);
    console.log(`  ${label.padEnd(30)} ${String(valueStr).padEnd(20)} ${sourceTag}`);
  }

  console.log('');
}

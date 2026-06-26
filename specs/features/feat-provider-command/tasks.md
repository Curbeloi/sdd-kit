# Tasks: feat-provider-command

## Tasks

- [x] **1.1** Add `writeRc(cwd, updates)` to `src/core/config.js` (merge, drop empties, reset cache)
- [x] **1.2** Export `PROVIDER_LABELS` + `SUPPORTED_PROVIDERS` from `src/core/providers/index.js`
- [x] **2.1** New `src/commands/provider.js`: `providerListCmd` (active + source highlighting)
- [x] **2.2** `providerSetCmd` — validate, writeRc, doctor hint, no-model warning
- [x] **2.3** Pure `fetchModels({ providerName, baseURL, apiKey })` → string[] (timeout)
- [x] **2.4** `providerModelsCmd` — route by provider; opencode listing via `opencode models`
- [x] **3.1** Register `sdd provider list|set|models` in `src/cli.js`
- [x] **4.1** Tests: `writeRc` merge/preserve, provider routing/validation `src/commands/provider.test.js`

# Tasks: feat-multi-llm-provider

> Created: 2026-06-26 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>

## Context

Abstraer las dos capas LLM (texto y agéntica) a multi-proveedor configurable, con retrocompatibilidad total y `openai` como dependencia opcional.

## Tasks

- [x] **1.1** Añadir defaults provider/model/base_url/api_key_env/agent_cli/agent_model a config `src/core/config.js` <- US1, US2, US3
- [x] **1.2** Mapear las nuevas claves en getConfig + _sources `src/core/config.js` <- US4
- [x] **2.1** Definir el contrato de proveedor `src/core/providers/provider.js` <- US1
- [x] **2.2** Implementar anthropic-provider (SDK nativo, modelo configurable, default claude-sonnet-4-6) `src/core/providers/anthropic-provider.js` <- US1, US2
- [x] **2.3** Implementar openai-provider (paquete openai lazy/opcional, baseURL configurable) `src/core/providers/openai-provider.js` <- US1
- [x] **2.4** Implementar cli-provider (claude -p, modelo alias Claude Code) `src/core/providers/cli-provider.js` <- US1, US2
- [x] **2.5** Implementar selectProvider con detección por config/env `src/core/providers/index.js` <- US1
- [x] **3.1** Refactor claude-api.js a fachada sobre providers, conservando firmas `src/core/claude-api.js` <- US4
- [x] **4.1** Generalizar generator.js a descriptor de CLI agéntico (claude/opencode) `src/core/generator.js` <- US3
- [x] **4.2** detectMode usa config.agent_cli y disponibilidad del CLI `src/core/generator.js` <- US3
- [x] **4.3** opencode descriptor con flags verificados (run posicional, --model provider/model, skip-permissions) `src/core/generator.js` <- US3
- [x] **4.4** sdd init refleja el bloque SDD en AGENTS.md cuando existe (opencode) `src/commands/init.js` <- US3
- [x] **5.1** Mostrar provider/model/agent_cli en sdd config `src/commands/config.js` <- US4
- [x] **5.2** Añadir openai a optionalDependencies `package.json` <- US4
- [x] **6.1** Tests de providers (mock SDK/openai/spawn) `src/core/providers/providers.test.js` <- US1, US2
- [x] **6.2** Tests de config para las nuevas claves `src/core/config.test.js` <- US4
- [x] **6.3** Tests de selección de CLI agéntico `src/core/generator.test.js` <- US3
- [x] **6.4** Tests de init: AGENTS.md espejo + idempotencia `src/commands/init.test.js` <- US3
- [x] **7.1** Documentar configuración de proveedor/modelo en README y bloque SDD `README.md` <- US4
- [x] **8.1** pnpm test verde + verificación retrocompat `package.json` <- US4

# Tasks: feat-provider-enhancements

> Created: 2026-06-26 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>

## Context

Cuatro mejoras sobre el multi-proveedor: doctor, max_completion_tokens, progreso opencode, flags de override.

## Tasks

- [x] **1.1** openai-provider: elegir max_completion_tokens (OpenAI) vs max_tokens (ollama/vllm) y reintentar con el alternativo si el endpoint lo rechaza `src/core/providers/openai-provider.js` <- US2
- [x] **1.2** index.js pasa el tokenParam preferido según variante al openai-provider `src/core/providers/index.js` <- US2
- [x] **2.1** generator.js: opencode usa --format json y parser defensivo de eventos (tool/text/step-finish) `src/core/generator.js` <- US3
- [x] **3.1** config.js: store de overrides (setOverrides/clearOverrides) con máxima precedencia `src/core/config.js` <- US4
- [x] **3.2** cli.js: opciones --provider/--model en create/execute/refresh/document/arch/init que llaman setOverrides `src/cli.js` <- US4
- [x] **4.1** Comando sdd doctor que valida proveedor de texto + CLI agéntico (key, paquete, endpoint, modelo, PATH) `src/commands/doctor.js` <- US1
- [x] **4.2** Registrar sdd doctor en el CLI `src/cli.js` <- US1
- [x] **5.1** Tests: max_completion_tokens selection, overrides precedence, opencode event parsing `src/core/providers/providers.test.js` <- US2, US4, US3
- [x] **5.2** Documentar doctor + flags + max_completion_tokens en README `README.md` <- US1, US4
- [x] **6.1** pnpm test verde + smoke de sdd doctor `package.json` <- US1

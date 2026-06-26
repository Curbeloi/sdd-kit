# Requirements: feat-provider-enhancements

> Created: 2026-06-26 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Robustez y DX sobre el multi-proveedor (feat-multi-llm-provider).

## Contexto

Tras el multi-proveedor, hay cuatro mejoras concretas: validar el setup (doctor),
corregir el parámetro de tokens para OpenAI nuevo, dar progreso a opencode, y
permitir override por comando.

## User Stories

### US1 — `sdd doctor` valida el setup
**Criterios de aceptación:**
- [ ] `sdd doctor` reporta el proveedor de texto y el CLI agéntico activos + su origen.
- [ ] Verifica por capa: API key presente (anthropic/openai), paquete `openai` instalado (openai/ollama/vllm), endpoint alcanzable (HTTP a `base_url`), modelo configurado, y CLI agéntico en PATH (`--version`).
- [ ] Imprime checklist con ✓/✗ y una pista accionable por cada ✗. Exit code ≠ 0 si hay fallos.

### US2 — Compat `max_completion_tokens` (OpenAI nuevo)
**Criterios de aceptación:**
- [ ] El openai-provider usa `max_completion_tokens` para OpenAI y `max_tokens` para Ollama/vLLM por defecto.
- [ ] Si el endpoint rechaza el parámetro enviado (error menciona el otro), reintenta una vez con el alternativo (robusto ante gateways).

### US3 — Progreso de opencode
**Criterios de aceptación:**
- [ ] El descriptor de opencode usa `--format json`.
- [ ] Se parsean eventos `message.part.updated` (tool/text/thinking) y `step-finish` (coste/tokens) para emitir `onProgress`, de forma defensiva (no rompe si falta el evento final; cae a texto si el esquema difiere).

### US4 — Flags `--provider` / `--model` por comando
**Criterios de aceptación:**
- [ ] Los comandos relevantes (create/execute/refresh/document/arch/init) aceptan `--provider` y `--model`.
- [ ] Los flags tienen máxima precedencia (CLI > .sddrc > env > default) y se reflejan en `sdd config`/`sdd doctor` como origen `cli`.

## Fuera de alcance
- Streaming de tokens al usuario en la capa de texto.
- Permisos finos de opencode (se mantiene el modo no-interactivo actual).

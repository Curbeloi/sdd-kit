# Requirements: feat-multi-llm-provider

> Created: 2026-06-26 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Soporte multi-proveedor de LLM en las dos capas (generación de texto y ejecución agéntica).

## Contexto

sdd-kit está acoplado a Anthropic en dos capas:
- **Capa A (generación de texto):** `src/core/claude-api.js` (`askClaude`/`batchAsk`), usada por init/refresh/document. Modelo hardcodeado a `claude-sonnet-4-20250514` (deprecado).
- **Capa B (ejecución agéntica):** `src/core/generator.js` hace `spawn('claude', …)`, usada por create/execute/arch.

Se quiere soportar OpenAI, Ollama y vLLM (capa A, vía API OpenAI-compatible) y opencode u otros CLI agénticos (capa B), con proveedor y modelo configurables y retrocompatibilidad total.

## User Stories

### US1 — Proveedor de texto configurable (capa A)
Como usuario, quiero elegir el proveedor LLM para generación de texto.

**Criterios de aceptación:**
- [ ] `provider` configurable: `auto` | `anthropic` | `openai` | `ollama` | `vllm` | `claude-cli`.
- [ ] En `auto`: si hay `ANTHROPIC_API_KEY` → anthropic; si hay `OPENAI_API_KEY` → openai; si no → claude-cli.
- [ ] OpenAI/Ollama/vLLM funcionan vía un único proveedor OpenAI-compatible con `base_url` configurable.
- [ ] Anthropic usa el SDK nativo (no shim OpenAI).

### US2 — Modelo configurable
Como usuario, quiero fijar el modelo por configuración en vez de un ID hardcodeado.

**Criterios de aceptación:**
- [ ] `model` configurable vía `.sddrc`/env. Default Anthropic SDK = `claude-sonnet-4-6`.
- [ ] El CLI de Claude usa alias de Claude Code (`sonnet`/`opus`/`haiku`; default `sonnet`).
- [ ] Ya no se referencia el snapshot deprecado `claude-sonnet-4-20250514`.

### US3 — CLI agéntico configurable (capa B)
Como usuario, quiero usar opencode (u otro CLI agéntico) en lugar de `claude`.

**Criterios de aceptación:**
- [ ] `agent_cli` configurable: `claude` (default) | `opencode`.
- [ ] La invocación se construye desde un descriptor por CLI; `detectMode` comprueba disponibilidad del CLI elegido y cae a prompt-only si no está.
- [ ] Flags de opencode verificados: `opencode run <prompt>` (posicional), `--model provider/model`, `--dangerously-skip-permissions` para correr no-interactivo.
- [ ] Instalación: opencode descubre el skill en `.claude/skills/` y lee `CLAUDE.md` como fallback; `sdd init` refleja el bloque SDD en `AGENTS.md` cuando el proyecto ya tiene uno.

### US4 — Retrocompatibilidad y visibilidad
**Criterios de aceptación:**
- [ ] Sin configuración, el comportamiento con Anthropic/Claude CLI es idéntico al actual.
- [ ] Las firmas de `askClaude`/`batchAsk`/`detectEngine`/`getEngineName` se conservan (consumidores intactos).
- [ ] `sdd config` muestra `provider`, `model`, `agent_cli` y su origen.
- [ ] `openai` es dependencia opcional con import lazy y error claro si falta.

## Fuera de alcance
- Streaming de tokens de proveedores OpenAI-compatible (se usa respuesta completa, como hoy).
- Conversión de la capa agéntica a APIs no-CLI.

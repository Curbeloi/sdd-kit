# Requirements: feat-provider-command

> Roadmap item 1. A `sdd provider` command to inspect, switch, and configure the LLM provider without hand-editing `.sddrc`, plus model discovery (including opencode).

## User stories

- As a user, I run `sdd provider list` to see every supported provider and which one is active (+ its source).
- As a user, I run `sdd provider set openai --model gpt-4o` to switch provider and persist it to `.sddrc` without touching other settings.
- As a user, I run `sdd provider models` to list the models available from the active provider's endpoint.
- As an opencode user, `sdd provider models` also lists models available through opencode.

## Acceptance criteria

1. `sdd provider list` prints all of `anthropic`, `openai`, `ollama`, `vllm`, `claude-cli`, highlighting the active one (from `resolveProviderName`) and its config source.
2. `sdd provider set <provider> [--model] [--base-url] [--api-key-env]`:
   - validates `<provider>` against the supported set (`auto` allowed);
   - merges only the provided keys into `.sddrc` (preserves the rest), pretty-printed JSON;
   - prints the result and suggests `sdd doctor`;
   - warns when an OpenAI-compatible provider has no model configured.
3. `sdd provider models [--provider <name>]`:
   - anthropic → `GET /v1/models` (x-api-key, anthropic-version);
   - openai/ollama/vllm → `GET {base_url}/models` (Bearer key when present);
   - claude-cli → prints Claude Code aliases (sonnet/opus/haiku);
   - when `agent_cli=opencode` or opencode is on PATH → also lists opencode models (`opencode models`), failing gracefully.
4. `.sddrc` writing is a pure, tested helper that drops empty values and invalidates the config cache.
5. Network calls time out (AbortController) and report errors without crashing.

## Out of scope

- Interactive prompts (kept non-interactive / scriptable / CI-friendly; configuration is via flags).

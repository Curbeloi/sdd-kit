# Tasks: feat-token-opt-t1

> Created: 2026-04-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Token optimization Tier 1: default changes

- [x] **1.1** Change default level in `createCmd` from 3 → 2 `src/commands/spec/create.js` <- Req 1
- [x] **1.2** Update `-1/-2/-3` flag help, action wiring, level help block, and examples in `src/cli.js` to reflect `-2` as default <- Req 1
- [x] **2.1** Add `Option` import + `--refresh <mode>` to `spec execute` in `src/cli.js` with choices `auto|structural|off`, default `structural` <- Req 2
- [x] **2.2** Gate module auto-refresh in `executeCmd` using `refreshMode` and existing `changes.hasStructuralChange` `src/commands/spec/execute.js` <- Req 2
- [x] **2.3** Skip steering refresh entirely when `--refresh=off` `src/commands/spec/execute.js` <- Req 2
- [x] **3.1** Parameterize `maxTokens` in `refreshModule` and `refreshCmd`, default 1000 `src/commands/spec/refresh.js` <- Req 3
- [x] **3.2** Add `-v, --verbose` flag to `spec refresh` in `src/cli.js`; when set, pass `maxTokens: 2000` <- Req 3
- [x] **4.1** Update the embedded `SDD_BLOCK` CLAUDE.md template in `src/commands/init.js` to show `-2` as default and document `--refresh` / `--verbose` flags <- Req 4
- [x] **4.2** Update `README.md` spec-size table, examples, and "How documentation stays up to date" section to reflect the new defaults <- Req 4
- [x] **5.1** Add test `src/commands/spec/create.test.js` covering default level (req+tasks only), explicit `-1` and `-3`, and `specDir` file presence <- Req 1
- [ ] **5.2** ~~Add test `src/commands/spec/refresh.test.js`~~ — skipped: mocking `askClaude` requires either module-mock support (unstable in Node 18) or extracting logic; not worth the complexity for T1. Covered by manual smoke test. <- Req 3
- [x] **6.1** Run `npm test`; fix failures (47/47 pass) <- Req 1-4
- [x] **6.2** Manual smoke test: default creates only req+tasks; `-1`/`-3` work; `--refresh=off|auto` visible; `--verbose` visible <- Req 1-4

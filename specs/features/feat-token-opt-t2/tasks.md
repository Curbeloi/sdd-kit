# Tasks: feat-token-opt-t2

> Created: 2026-04-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Token optimization Tier 2: hash-based refresh dedup

- [x] **1.1** Create `src/core/hash-cache.js` with `loadCache`, `saveCache`, `getFileHash`, `computeGroupHash`, `sha1`. Cache format: `{ version: 1, entries: { [path]: { mtime, size, sha1 } } }` <- Req design
- [x] **2.1** Add `parseFrontmatter(content)` and `stringifyFrontmatter(frontmatter, body)` to `src/core/spec-reader.js` <- Req design
- [x] **3.1** Update `refreshModule` in `src/commands/spec/refresh.js`: compute group hash, read existing spec frontmatter, skip + return `{ skipped: true }` if match; otherwise regenerate and write with new frontmatter. Accept `force` option. <- Req criteria 1-5
- [x] **3.2** Update `refreshCmd` bulk path: pre-compute hashes per group, filter out unchanged groups before `batchAsk`, write frontmatter on result. Log skipped count clearly. <- Req criteria 1-4
- [x] **4.1** Add `-f, --force` flag + i18n strings to `spec refresh` in `src/cli.js`; pass through to `refreshCmd` <- Req criteria 3
- [x] **5.1** Add `ensureGitignore(cwd)` to `src/commands/init.js`; call it from `initCmd`. Idempotent <- Req criteria 7
- [x] **5.2** Update this repo's `.gitignore` to include `.sdd/` <- Req criteria 7
- [x] **6.1** Update CLAUDE.md template in `src/commands/init.js` and repo `CLAUDE.md` to document `--force` flag <- Req criteria 3
- [x] **6.2** Update `README.md` to mention hash-based skip and `--force` in the `sdd spec refresh` section <- Req criteria 3
- [x] **7.1** Add `src/core/hash-cache.test.js`: empty cache, save+load roundtrip, mtime cache hit, content change detection, group hash order-independence (11 tests) <- Req criteria
- [x] **7.2** Add frontmatter tests to `src/core/spec-reader.test.js` (10 tests covering parse/stringify/roundtrip) <- Req criteria
- [x] **8.1** Run `npm test`; 68/68 pass <- Req all
- [x] **8.2** Manual smoke verified: (a) `--force` flag visible in help, (b) hash-cache produces stable hash after `touch` without content change, (c) content edit changes hash, (d) `ensureGitignore` is idempotent and appends `.sdd/` correctly <- Req criteria

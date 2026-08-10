# Tasks: feat-spec-type-folders

## Tasks

- [x] **1.1** Add `SPEC_TYPE_DIRS` map + `specTypeDirs(cwd)` to `src/core/spec-reader.js`
- [x] **1.2** Add `specDestDir(cwd, name)` + `resolveSpecDir(cwd, name)` to `src/core/spec-reader.js`
- [x] **1.3** Refactor `readSpec` → `readSpecAt(cwd, dir, name)`; `readAllSpecs` aggregates type dirs; exclude empties
- [x] **2.1** Unit tests for routing + resolution + aggregation `src/core/spec-reader.test.js`
- [x] **3.1** `create.js` → use `specDestDir`; log routed relative path
- [x] **3.2** `list.js` → use `spec.dir`; show type when not `features`
- [x] **3.3** `execute.js` → prompt-fallback dir uses `spec.dir`
- [x] **3.4** `delete.js` / `rename.js` / `archive.js` → use `resolveSpecDir` / `specDestDir`
- [x] **4.1** Full suite green; manual smoke for `fix-`/`chore-` routing

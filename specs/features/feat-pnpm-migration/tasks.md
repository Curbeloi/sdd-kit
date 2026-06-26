# Tasks: feat-pnpm-migration

> Created: 2026-06-26 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Migrar el toolchain de desarrollo de npm a pnpm, arreglar el workflow de CI y reubicar las plantillas de GitHub.

## Context

Migración solo de dev/CI a pnpm. Los consumidores del paquete siguen usando npm/npx.
Incluye arreglo del workflow mal nombrado y reubicación de plantillas de GitHub.

## Tasks

- [x] **1.1** Añadir `"packageManager": "pnpm@10.12.1"` a package.json `package.json` <- US1
- [x] **1.2** Importar lock con `pnpm import` y eliminar package-lock.json `pnpm-lock.yaml` <- US1
- [x] **1.3** `pnpm install` reconstruye node_modules `package.json` <- US1
- [x] **1.4** `pnpm test` con los 80 tests en verde `package.json` <- US1
- [x] **1.5** Añadir package-lock.json a .gitignore `.gitignore` <- US1
- [x] **2.1** Renombrar webpack.yml → ci.yml `.github/workflows/ci.yml` <- US2
- [x] **2.2** Añadir `pnpm/action-setup@v4` antes de setup-node `.github/workflows/ci.yml` <- US2
- [x] **2.3** Cambiar `cache: npm` → `cache: pnpm` `.github/workflows/ci.yml` <- US2
- [x] **2.4** `npm ci`/`npm test` → `pnpm install --frozen-lockfile`/`pnpm test` `.github/workflows/ci.yml` <- US2
- [x] **2.5** job sdd-compliance: `package-lock.json` → `pnpm-lock.yaml` `.github/workflows/ci.yml` <- US2
- [x] **3.1** Plantillas de issue ricas en `.github/ISSUE_TEMPLATE/` `.github/ISSUE_TEMPLATE/bug_report.md` <- US3
- [x] **3.2** Mover PR template a `.github/PULL_REQUEST_TEMPLATE.md` `.github/PULL_REQUEST_TEMPLATE.md` <- US3
- [x] **3.3** Eliminar copias en la raíz y el stub custom.md `bug_report.md` <- US3
- [x] **3.4** Frontmatter de plantillas válido (name/about) `.github/ISSUE_TEMPLATE/feature_request.md` <- US3
- [x] **4.1** CONTRIBUTING.md: install/link/test a pnpm `CONTRIBUTING.md` <- US4
- [x] **4.2** README.md sección dev local a pnpm `README.md` <- US4
- [x] **4.3** Instalación de usuario final se mantiene en npm/npx `README.md` <- US4
- [x] **5.1** `pnpm test` verde y `node bin/sdd.js --version` OK `package.json` <- US1
- [x] **5.2** git status coherente (lock añadido, npm lock borrado, plantillas movidas) `.gitignore` <- US1
- [x] **5.3** YAML del workflow válido `.github/workflows/ci.yml` <- US2

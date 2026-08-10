# Requirements: feat-pnpm-migration

> Created: 2026-06-26 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Migrar el toolchain de desarrollo de npm a pnpm, arreglar el workflow de CI y reubicar las plantillas de GitHub.

## Contexto

El proyecto usa npm para desarrollo. Se quiere migrar a **pnpm** por su mayor
seguridad e integridad: `node_modules` con enlaces estrictos (sin dependencias
fantasma) y un store content-addressable con verificación de integridad.

La migración es **solo del toolchain de desarrollo/CI**. Los consumidores del
paquete publicado en npm siguen instalando con `npm i -g sdd-kit` / `npx sdd-kit`
— eso NO debe cambiar.

Además se arreglan dos defectos detectados:
- El workflow `.github/workflows/webpack.yml` no tiene relación con webpack
  (es un CLI Node); nombre engañoso y usa `cache: npm`.
- Las plantillas `bug_report.md`, `feature_request.md` y
  `PULL_REQUEST_TEMPLATE.md` están en la raíz, donde GitHub **no las reconoce**.

## User Stories

### US1 — Toolchain con pnpm
Como mantenedor, quiero usar pnpm en desarrollo y CI para tener instalaciones
reproducibles y seguras.

**Criterios de aceptación:**
- [ ] `package.json` declara `"packageManager": "pnpm@<versión>"`.
- [ ] Existe `pnpm-lock.yaml` y se elimina `package-lock.json`.
- [ ] `pnpm install` y `pnpm test` funcionan (los 80 tests pasan).
- [ ] `package-lock.json` se añade a `.gitignore` (o se confirma su borrado del repo).

### US2 — CI correcto y bien nombrado
Como mantenedor, quiero un workflow de CI claro que use pnpm.

**Criterios de aceptación:**
- [ ] El workflow se llama `.github/workflows/ci.yml` (renombrado desde `webpack.yml`).
- [ ] Usa `pnpm/action-setup` + `actions/setup-node` con `cache: pnpm`.
- [ ] Instala con `pnpm install --frozen-lockfile` y corre `pnpm test`.
- [ ] El job `sdd-compliance` referencia `pnpm-lock.yaml` en lugar de `package-lock.json`.
- [ ] La matriz de Node (18/20/22) se mantiene.

### US3 — Plantillas de GitHub en su sitio
Como mantenedor, quiero que las plantillas de issues/PR funcionen en GitHub.

**Criterios de aceptación:**
- [ ] `bug_report.md` y `feature_request.md` viven en `.github/ISSUE_TEMPLATE/`.
- [ ] La plantilla de PR vive en `.github/PULL_REQUEST_TEMPLATE.md`.
- [ ] Las copias en la raíz se eliminan.

### US4 — Documentación actualizada
Como contribuidor, quiero que los docs de desarrollo usen pnpm.

**Criterios de aceptación:**
- [ ] `CONTRIBUTING.md` usa `pnpm install`, `pnpm link`, `pnpm test`.
- [ ] En `README.md` las secciones de **desarrollo local** usan pnpm.
- [ ] Las instrucciones de **instalación para usuarios finales**
      (`npm install -g sdd-kit`, `npx sdd-kit`) se mantienen con npm/npx.

## Fuera de alcance

- Cambiar cómo los usuarios finales instalan el paquete.
- Tocar el contenido funcional de los workflows más allá del gestor de paquetes.

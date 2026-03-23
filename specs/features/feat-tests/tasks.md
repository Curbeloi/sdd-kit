# Tasks: feat-tests

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Tests unitarios para funciones criticas del core

## Context

Agregar tests unitarios usando Node.js built-in test runner (node --test). Sin dependencias extra.

## Tasks

- [x] **1.1** Crear test helpers con withTempDir y createMockSpec `src/test-helpers.js` <- R1
- [x] **2.1** Crear tests para parseTasks y findNextPendingTask `src/core/spec-reader.test.js` <- R2
- [x] **3.1** Crear tests para groupByDirectory y buildGroupPrompt `src/core/scanner.test.js` <- R3
- [x] **4.1** Crear tests para getAffectedModuleDirs `src/core/git-changes.test.js` <- R4

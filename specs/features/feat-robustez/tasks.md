# Tasks: feat-robustez

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Robustez: eliminar catch vacios, hardening de regex, validaciones de input, timer leak

## Context

Mejorar la robustez del core de sdd-kit eliminando errores silenciosos, endureciendo el parseo de tareas, y agregando validaciones faltantes.

## Tasks

- [x] **1.1** Crear modulo de debug logging `src/core/log.js` <- R1
- [x] **1.2** Reemplazar catch vacios con debug logging en scanner.js `src/core/scanner.js` <- R1
- [x] **1.3** Reemplazar catch vacios con debug logging en git-changes.js `src/core/git-changes.js` <- R1
- [x] **1.4** Reemplazar catch vacios con debug logging en generator.js `src/core/generator.js` <- R1
- [x] **1.5** Agregar warning visible en refreshSteering catch vacio `src/commands/init.js` <- R1
- [x] **1.6** Agregar tracking de archivos saltados por tamano en scanner `src/core/scanner.js` <- R1
- [x] **2.1** Mejorar regex de parseo de tareas para IDs multi-nivel y paths flexibles `src/core/spec-reader.js` <- R2
- [x] **3.1** Agregar validacion de slug vacio y spec existente en create `src/commands/spec/create.js` <- R3
- [x] **4.1** Agregar validacion de API key y timeout en SDK `src/core/claude-api.js` <- R4
- [x] **4.2** Agregar error descriptivo si @anthropic-ai/sdk no esta instalado `src/core/claude-api.js` <- R4
- [x] **5.1** Corregir timer leak en proc.on error handler `src/core/generator.js` <- R5

# Tasks: feat-config

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Configuracion .sddrc: sistema de config con defaults, override por archivo y env vars

## Context

Crear un sistema de configuracion centralizado que reemplace las constantes hardcodeadas en spec-reader, scanner, claude-api, y arch.

## Tasks

- [x] **1.1** Crear modulo config.js con getConfig, defaults y lectura de .sddrc `src/core/config.js` <- R1, R2
- [x] **1.2** Migrar constantes de spec-reader.js a usar config `src/core/spec-reader.js` <- R2
- [x] **1.3** Migrar MAX_FILE_SIZE y max_depth de scanner.js a usar config `src/core/scanner.js` <- R2
- [x] **1.4** Migrar concurrency default de claude-api.js a usar config `src/core/claude-api.js` <- R2
- [x] **1.5** Migrar arch output dir a usar config `src/commands/arch.js` <- R2
- [x] **2.1** Crear comando sdd config para mostrar configuracion activa `src/commands/config.js` <- R4
- [x] **2.2** Registrar comando config en CLI `src/cli.js` <- R4
- [x] **3.1** Crear tests para config.js `src/core/config.test.js` <- R1

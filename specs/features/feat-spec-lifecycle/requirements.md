# Requirements: feat-spec-lifecycle

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Lifecycle de specs: comandos list, delete, rename, archive

## Problem

sdd-kit solo permite crear y ejecutar specs. No hay forma de listar, borrar, renombrar, ni archivar specs completados o abandonados. El directorio specs/features/ se llena sin forma de gestionar el ciclo de vida.

## Requirements

### R1: sdd spec list
- WHEN se ejecuta `sdd spec list` THEN muestra todos los specs con nombre, archivos presentes (R/D/T), progreso, y fecha
- WHEN no hay specs THEN muestra mensaje informativo

### R2: sdd spec delete
- WHEN se ejecuta `sdd spec delete <name>` THEN pide confirmacion y borra el directorio completo
- WHEN se usa `--force` THEN borra sin confirmacion
- WHEN el spec no existe THEN muestra error

### R3: sdd spec rename
- WHEN se ejecuta `sdd spec rename <old> <new>` THEN renombra el directorio y actualiza headers
- WHEN el destino ya existe THEN muestra error
- WHEN el origen no existe THEN muestra error

### R4: sdd spec archive
- WHEN se ejecuta `sdd spec archive <name>` THEN mueve a specs/archived/
- WHEN se usa `--restore` THEN mueve de specs/archived/ de vuelta a specs/features/
- WHEN el spec archivado no existe (con --restore) THEN muestra error

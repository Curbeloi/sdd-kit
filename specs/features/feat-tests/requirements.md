# Requirements: feat-tests

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Tests unitarios para funciones criticas del core

## Problem

sdd-kit no tiene ningun test unitario. Las funciones criticas de parseo, escaneo, y deteccion de cambios git pueden romperse con refactors sin que nadie lo detecte.

## Requirements

### R1: Test helpers
- WHEN se necesita un directorio temporal para tests THEN `withTempDir()` debe crearlo y limpiarlo

### R2: spec-reader tests
- WHEN `parseTasks()` recibe tareas validas THEN debe parsear correctamente checkbox, ID, desc, y file
- WHEN `parseTasks()` recibe IDs multi-nivel (1.2.3) THEN debe parsearlos
- WHEN `parseTasks()` recibe contenido vacio THEN debe retornar array vacio
- WHEN `findNextPendingTask()` tiene todas done THEN debe retornar null

### R3: scanner tests
- WHEN `groupByDirectory()` recibe archivos en raiz y subdirectorios THEN debe agrupar correctamente
- WHEN `buildGroupPrompt()` genera un prompt THEN debe incluir el nombre del directorio y el contenido

### R4: git-changes tests
- WHEN `getAffectedModuleDirs()` recibe paths anidados THEN debe extraer los directorios correctos
- WHEN `getAffectedModuleDirs()` recibe archivos en raiz THEN debe retornar "."

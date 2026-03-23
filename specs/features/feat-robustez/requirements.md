# Requirements: feat-robustez

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Robustez: eliminar catch vacios, hardening de regex, validaciones de input, timer leak

## Problem

sdd-kit tiene multiples bloques `catch {}` vacios que tragan errores silenciosamente, un regex de parseo de tareas fragil que falla con formatos validos, falta de validacion en inputs del usuario, y un timer leak en generator.js. Esto dificulta el debugging y produce comportamiento inesperado.

## Requirements

### R1: Debug logging en lugar de catch vacios
- WHEN `SDD_DEBUG=1` esta configurado THEN todos los errores capturados deben loguearse a stderr con contexto
- WHEN un archivo es saltado por tamano o permiso THEN el usuario debe ver un resumen al final del scan
- WHEN `refreshSteering` falla THEN debe mostrarse un warning visible (no silencioso)

### R2: Regex de tareas robusto
- WHEN una tarea tiene ID multi-nivel (e.g. `1.2.3`) THEN debe parsearse correctamente
- WHEN el path entre backticks no contiene `/` o `.` THEN debe capturarse igual
- WHEN hay backticks en la descripcion de la tarea THEN no debe romper el parseo

### R3: Validaciones de input en spec create
- WHEN el slug generado es vacio THEN debe mostrar error y salir
- WHEN el spec ya existe THEN debe avisar al usuario
- WHEN se pasan flags mutuamente excluyentes (-1 + -2) THEN debe mostrar error

### R4: Validaciones en claude-api
- WHEN el API key es invalido (no empieza con `sk-`) THEN debe mostrar error claro antes de llamar
- WHEN la llamada SDK no responde en 5 minutos THEN debe abortar con timeout
- WHEN el paquete @anthropic-ai/sdk no esta instalado THEN debe mostrar error descriptivo

### R5: Timer leak en generator.js
- WHEN el proceso de Claude Code emite un error THEN el timer debe limpiarse antes de rechazar la promesa

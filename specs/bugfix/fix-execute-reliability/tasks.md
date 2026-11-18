# Tasks: fix-execute-reliability

> Created: 2026-11-18 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: sdd spec execute recorta el spec, no comprueba que la tarea quedó marcada y varios fallos salen con código 0

## Context

Hacer fiable `sdd spec execute`: que el agente pueda leer el spec completo, que sdd compruebe que la tarea quedó marcada, que un spec sin tareas no pase por terminado y que los fallos salgan con código distinto de 0. Incluye las primeras pruebas de `execute.js`.

## Tasks

### 1. Prompt de execute

- [x] **1.1** Incluir en el prompt la ruta real del spec y de tasks.md, y eliminar la ruta fija a specs/features `src/core/generator.js` <- R1
- [x] **1.2** Enviar requirements y design enteros hasta 20.000 caracteres y marcar cada extracto recortado con la ruta del archivo completo `src/core/generator.js` <- R1
- [x] **1.3** Pasar la raíz del proyecto y el directorio del spec al generador del prompt `src/commands/spec/execute.js` <- R1

### 2. Verificación posterior y tareas no reconocidas

- [x] **2.1** Detectar las líneas con casilla que el parser no reconoce y exponerlas en el spec leído `src/core/spec-reader.js` <- R4
- [x] **2.2** Releer tasks.md tras la ejecución y salir con código 1 si la tarea no quedó marcada `src/commands/spec/execute.js` <- R2
- [x] **2.3** Distinguir el spec sin tareas del spec terminado y mostrar el formato esperado `src/commands/spec/execute.js` <- R3
- [x] **2.4** Avisar de las líneas no reconocidas al ejecutar `src/commands/spec/execute.js` <- R4
- [x] **2.5** Avisar de las líneas no reconocidas en el estado de un spec `src/commands/spec/status.js` <- R4

### 3. Códigos de salida y mensajes

- [x] **3.1** Salir con código 1 cuando la tarea pedida no existe `src/commands/spec/execute.js` <- R5
- [x] **3.2** Salir con código 1 cuando falla el listado de modelos `src/commands/provider.js` <- R5
- [x] **3.3** Salir con código 1 cuando init auto no genera algún archivo de steering `src/commands/init.js` <- R5
- [x] **3.4** Sustituir process.exit por exitCode y return, y usar la fecha local en la cabecera `src/commands/spec/create.js` <- R5 R8
- [x] **3.5** Añadir a cada CLI agéntico una etiqueta legible y exponer la del configurado `src/core/generator.js` <- R6
- [x] **3.6** Anunciar el fallback con el binario buscado y nombrar el CLI configurado en los mensajes `src/commands/spec/execute.js` <- R6
- [x] **3.7** Nombrar el CLI configurado en el fallback y en los mensajes de arch `src/commands/arch.js` <- R6
- [x] **3.8** Aplicar el tope de gasto en execute solo cuando está configurado explícitamente `src/core/generator.js` <- R7

### 4. Tests y documentación

- [x] **4.1** Probar el prompt: rutas, spec en carpeta de tipo y marca de recorte `src/core/generator.test.js` <- R1
- [x] **4.2** Probar la detección de líneas no reconocidas `src/core/spec-reader.test.js` <- R4
- [x] **4.3** Probar execute con un CLI agéntico falso: tarea marcada, sin marcar, spec sin tareas, tarea inexistente y fallback `src/commands/spec/execute.test.js` <- R2 R3 R5 R6
- [x] **4.4** Probar la fecha local y el rechazo sin process.exit `src/commands/spec/create.test.js` <- R5 R8
- [x] **4.5** Probar el código de salida de provider models ante un fallo `src/commands/provider.test.js` <- R5
- [x] **4.6** Corregir el alcance de agent_max_budget_usd y describir la verificación posterior de execute `README.md` <- R2 R7
- [x] **4.7** Probar el aviso de líneas no reconocidas en el estado de un spec `src/commands/spec/status.test.js` <- R4
- [x] **4.8** Probar el aviso de fallback y el nombre del CLI en arch `src/commands/arch.test.js` <- R6
- [x] **4.9** Probar el código de salida de init auto ante un fallo `src/commands/init.test.js` <- R5
- [x] **4.10** Mover el lanzador del binario a los helpers compartidos y añadir el CLI agéntico falso `src/test-helpers.js` <- R2

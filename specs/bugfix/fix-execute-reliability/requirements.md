# Requirements: fix-execute-reliability

> Created: 2026-11-18 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: sdd spec execute recorta el spec, no comprueba que la tarea quedó marcada y varios fallos salen con código 0

## Problem

Revisión del 2026-11-17 sobre v0.10.0 (`main` en 9da2501). Los defectos de abajo se comprobaron leyendo el código. Ninguno tiene prueba que lo cubra: `src/commands/spec/execute.js` no tiene archivo de pruebas.

**1. El agente recibe el spec recortado.** `generateExecutePrompt` corta `requirements.md` a 1.500 caracteres, `design.md` a 1.500 y el mapa de módulos a 3.000 (`src/core/generator.js:516-518`). No avisa al usuario ni al agente, y el prompt no incluye la ruta del spec, así que el agente no puede leer el resto. Los `requirements.md` de este repo miden entre 2.400 y 6.400 caracteres: todos se cortan. El recorte viene del primer release (9e31444), no de una optimización posterior.

**2. Nadie comprueba que la tarea quedó marcada.** El prompt pide "mark it complete in tasks.md" sin decir cuál `tasks.md` (`generator.js:522-524`). Después `execute` solo imprime "Check …/tasks.md for updated status" (`execute.js:76`). Si el agente no marca la tarea, la siguiente ejecución repite la misma, y un bucle `sdd spec execute x && …` no se entera.

**3. Un spec sin tareas se reporta como terminado.** `sdd spec create` escribe un `tasks.md` con solo la cabecera. `sdd spec execute` sobre ese spec responde "All tasks complete!" con código 0 (`execute.js:36-39`).

**4. Las tareas con formato distinto desaparecen.** `parseTasks` exige `- [ ] **1.2** descripción` en la columna 0 (`src/core/spec-reader.js:173`). Una línea con sangría, con `*` en vez de `-`, con el ID sin negrita o con un ID no numérico se ignora sin aviso, y el spec cae en el caso 3.

**5. Fallos que salen con código 0.**
- `--task` con un ID inexistente (`execute.js:28-33`).
- `sdd provider models` cuando la consulta falla (`src/commands/provider.js:152-154`).
- `sdd init --auto` cuando un archivo de steering no se genera (`src/commands/init.js:200-203`).
- Además, `create.js:54,62,73` llama a `process.exit(1)` directamente y se salta `exitWhenFlushed`, el único camino de salida que drena stdout.

**6. El fallback a prompt-only no dice por qué ocurre.** El README documenta que, si el CLI agéntico configurado no está instalado, `execute` y `arch` caen a modo prompt (README:589). Es intencional y se conserva. Pero `execute` no explica nada: imprime el prompt y "Paste into Claude Code" (`execute.js:126-137`). `arch` dice "Claude Code not found" aunque `agent_cli` sea `opencode` (`src/commands/arch.js:73`). Los mensajes de progreso y de éxito también nombran siempre a Claude Code (`execute.js:71,75`, `arch.js:65,84`).

**7. El tope de gasto no se aplica a `execute`.** El README dice que `agent_max_budget_usd` limita cada ejecución agéntica de `create`/`execute`/`arch` (README:504). `executeTask` no pasa ningún tope (`generator.js:536`); solo `arch` lo usa.

**8. La fecha de la cabecera del spec va en UTC.** `create.js:85` usa `toISOString()`. Este mismo spec se creó el 17 de noviembre por la tarde y su cabecera dice 2026-11-18.

## Requirements

### R1: el agente puede leer el spec completo
- WHEN se ejecuta una tarea THEN el prompt incluye la ruta, relativa a la raíz del proyecto, del directorio del spec y de su `tasks.md`
- WHEN el spec vive en una carpeta de tipo (`bugfix/`, `chore/`, …) THEN la ruta del prompt es la real, no `specs/features/<nombre>`
- WHEN `requirements.md` o `design.md` caben en 20.000 caracteres THEN viajan enteros en el prompt
- WHEN alguno excede ese tamaño THEN el extracto termina con una marca que dice que está recortado y da la ruta del archivo completo
- WHEN el mapa de módulos se recorta THEN el extracto termina con la misma marca y la ruta de `modules_dir`

### R2: sdd comprueba que la tarea quedó marcada
- WHEN el agente termina sin error THEN `execute` relee `tasks.md` y busca la tarea ejecutada
- WHEN la tarea sigue sin marcar THEN se avisa con el ID y la ruta de `tasks.md`, y el comando sale con código 1
- WHEN la tarea sigue sin marcar THEN el refresco de módulos y de steering se ejecuta igual, porque el código pudo cambiar
- WHEN la tarea quedó marcada THEN el mensaje de éxito lo confirma en lugar de pedir al usuario que lo revise
- sdd no marca la tarea por su cuenta: marcarla sin evidencia sería dar por hecho un trabajo que nadie comprobó

### R3: un spec sin tareas no es un spec terminado
- WHEN `tasks.md` no existe o no contiene ninguna tarea reconocida THEN `execute` dice que no hay tareas definidas, muestra el formato esperado y sale con código 1
- WHEN todas las tareas reconocidas están hechas THEN se conserva el mensaje actual y el código 0

### R4: las líneas de tarea no reconocidas son visibles
- WHEN `tasks.md` tiene líneas con casilla (`[ ]`, `[x]`) que el parser no reconoce THEN `execute` y `status <spec>` dicen cuántas son y muestran las tres primeras con su número de línea
- WHEN no hay ninguna THEN la salida no cambia
- `parseTasks` conserva su contrato actual; la detección va en una función aparte
- Comprobado el 2026-11-17: las 172 líneas con casilla de los specs de este repo se reconocen todas, así que el aviso no añade ruido aquí

### R5: los fallos salen con código distinto de 0
- WHEN `--task` nombra un ID que no existe THEN código 1
- WHEN `sdd provider models` no puede listar los modelos THEN código 1
- WHEN `sdd init --auto` no genera alguno de los archivos de steering THEN código 1
- WHEN `sdd spec create` rechaza la entrada THEN usa `process.exitCode = 1` y `return`, como el resto de comandos

### R6: el fallback a prompt-only se anuncia
- WHEN el CLI agéntico configurado no está instalado y no se pasó `--prompt-only` THEN `execute` y `arch` dicen qué binario buscaron y que caen a modo prompt
- WHEN ocurre el fallback THEN el código de salida sigue siendo 0, que es el comportamiento documentado
- WHEN `agent_cli` es `opencode` THEN ningún mensaje de `execute` ni de `arch` dice "Claude Code"

### R7: el tope de gasto de execute hace lo que dice la documentación
- WHEN `agent_max_budget_usd` está configurado explícitamente (`.sddrc`, variable de entorno) THEN `execute` lo aplica
- WHEN está en su valor por defecto THEN `execute` corre sin tope, como hoy
- WHEN se lee el README THEN describe exactamente ese comportamiento

### R8: la cabecera del spec usa la fecha local
- WHEN se crea un spec THEN `Created:` lleva la fecha del día local del usuario, no la de UTC

## Decisiones

Aprobadas tal como se proponen el 2026-11-17.

**D1 — tope de gasto (R7).** Aplicar el tope por defecto de 1 USD a `execute` cortaría a mitad tareas de implementación que hoy terminan, y dejaría el árbol a medio editar. No aplicarlo nunca deja sin protección a quien configuró un tope creyendo lo que dice el README. Por eso R7 lo aplica solo cuando el valor es explícito. La alternativa más simple es no tocar el código y corregir solo el README.

**D2 — tarea sin marcar (R2).** Se propone código 1 para que un bucle no repita la misma tarea indefinidamente. La alternativa es avisar y salir con 0.

**D3 — fallback (R6).** Se conserva el código 0 porque el README lo documenta como comportamiento esperado. Si prefieres que `sdd spec execute x && git commit` se detenga cuando no hay CLI, el cambio es de una línea, pero hay que actualizar el README.

## Fuera de alcance

- Valores desconocidos en `provider` o `agent_cli` que hoy se ejecutan como Claude sin avisar: van en `fix-config-consistency`.
- El prompt por argv del proveedor `claude-cli` y el soporte de opencode: van en `fix-large-prompts-and-opencode`.
- Lo que el README dice de `sdd spec create`: va en `chore-docs-truth`.

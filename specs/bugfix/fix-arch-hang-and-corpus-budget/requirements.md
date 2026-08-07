# Requirements: fix-arch-hang-and-corpus-budget

> Created: 2026-08-07 | Author: René Hechavarría <reneluishs@gmail.com>
> Feature: sdd arch no termina el proceso tras exito, y falla con corpus grandes sin decir por que

## Problem

Dos bugs confirmados el 2026-08-07 corriendo sdd-kit sobre dos repos reales con el engine Claude Code CLI.

**Bug 1 — el proceso nunca sale tras completar con EXITO.** En un repo de 43 module specs + 108 feature specs, `sdd arch` hace todo el trabajo bien: escribe architecture.md, architecture.json y dashboard.html, e imprime el resumen final completo. Pero el proceso node queda vivo indefinidamente (verificado >10 min; historicamente >1 hora). Hubo que matarlo con SIGTERM. Como el output es identico al de un run correcto, "terminado" es indistinguible de "sigue trabajando", y el workaround en uso era `timeout 600 npx sdd-kit arch`.

Causa raiz: el evento `result` del CLI de Claude Code trae el costo en `total_cost_usd`, pero el handler leia `event.cost_usd || event.cost`. Ninguno existe, asi que `onProgress({done:true})` nunca se disparaba, el `setInterval` del spinner (progress.js) nunca se limpiaba, y el event loop nunca drenaba. Solo afectaba el camino de EXITO: el camino de error ya llamaba `onProgress.stop()`. El mismo bug explica por que el costo del run nunca se mostraba.

**Bug 2 — falla con corpus grandes y el error es inutil.** En un repo de 34 module specs + 332 feature specs (~353k palabras), todas las corridas fallan con `Claude Code failed (exit 1): unknown error` a los 20s. El architecture.md de ese repo lleva ~3 meses congelado.

Causa raiz doble: (a) Claude Code reporta los fallos de API como JSON en **stdout** y deja stderr vacio; el handler leia `stderr || 'unknown error'` y descartaba el diagnostico que ya tenia en el buffer (`"Prompt is too long"`). (b) Los 332 feature specs se concatenaban enteros en un solo prompt de ~1.69 MB, que ademas excede ARG_MAX (1048576) porque el prompt viajaba como argumento de linea de comandos.

## Requirements

### R1: sdd arch sale solo tras completar
- WHEN `sdd arch` termina correctamente THEN el proceso node sale por si mismo sin intervencion
- WHEN el evento `result` no trae ningun campo de costo THEN la senal de fin se emite igual al cerrar el proceso hijo
- WHEN el CLI renombra o elimina campos del evento THEN el heartbeat del spinner no puede mantener vivo el event loop
- WHEN el comando falla THEN el heartbeat tambien se libera (cleanup en `finally`, no solo en `catch`)

### R2: ningun comando deja el proceso vivo tras imprimir su resultado
- WHEN cualquier comando de sdd-kit termina THEN el proceso sale, con stdout drenado antes de salir (no truncar output en pipe)
- WHEN un comando falla THEN sale con codigo distinto de 0
- WHEN el proceso hijo del CLI agentico sigue vivo al liberar la promesa THEN se le manda SIGTERM y se escala a SIGKILL
- WHEN se corre en CI THEN existe un test de regresion que falla (no cuelga) si el proceso no sale

### R3: propagar el error real del CLI agentico
- WHEN el CLI falla con stderr vacio THEN el mensaje se extrae de stdout (evento `result`, `errors[]`, turnos con `is_api_error_message`)
- WHEN el fallo es por contexto excedido THEN se identifica como tal y se nombra el remedio
- WHEN el fallo es por tope de gasto THEN se distingue del caso de contexto y se nombra su propio remedio
- WHEN no hay nada estructurado THEN se muestra la cola del output crudo, nunca la cadena "unknown error"
- WHEN se muestra el error THEN no se vuelca la linea JSON cruda del evento

### R4: el corpus de specs cabe siempre en el contexto
- WHEN el corpus excede el presupuesto THEN se recorta por prioridad: steering, luego module specs, luego feature specs
- WHEN los feature specs no caben enteros THEN el tier degrada completo (full -> summary -> headline), no a la mitad del corpus
- WHEN hay que omitir specs THEN se omiten los mas antiguos primero (por mtime)
- WHEN el corpus se recorta THEN se le informa al usuario; el recorte nunca es silencioso
- WHEN el prompt se recorta THEN se le indica al agente donde leer los specs completos en disco
- WHEN el prompt es de cientos de KB THEN viaja por stdin, no por argv (ARG_MAX)
- WHEN el usuario quiere otro presupuesto THEN es configurable via `arch_max_prompt_chars`

### R5: ciclo de vida del corpus
- WHEN se ejecuta `sdd spec archive --completed` THEN archiva los specs cuyas tareas estan todas hechas
- WHEN se ejecuta `sdd spec archive --before <fecha>` THEN archiva los specs sin cambios desde esa fecha
- WHEN se usa `--dry-run` THEN lista lo que moveria sin mover nada
- WHEN un spec tiene tasks.md vacio THEN cuenta como no empezado, no como terminado (no se archiva con `--completed`)
- WHEN un spec queda archivado THEN sale del corpus de `sdd arch` y de `sdd spec status`

### R6: el tope de gasto por run es configurable
- WHEN un corpus grande cuesta mas de 1 USD analizarlo THEN el tope se puede subir via `agent_max_budget_usd`
- WHEN se agota el tope THEN el error lo dice y muestra el valor actual

### R7: las banderas documentadas hacen lo que dicen
- WHEN se pasa `--level system|services|modules` THEN el prompt pide enfasis en ese nivel
- WHEN se pasa `--level` THEN se siguen emitiendo todas las secciones (el dashboard las renderiza todas)
- WHEN no se pasa `--level` THEN el prompt por defecto no cambia respecto al verificado en vivo
- WHEN se pasa `--flow <feature>` THEN se pide un sequenceDiagram detallado de esa feature
- WHEN `--flow` no coincide con ningun spec THEN falla con codigo 1 y sugiere el nombre parecido
- WHEN `--level` recibe un valor invalido THEN commander lo rechaza listando los validos

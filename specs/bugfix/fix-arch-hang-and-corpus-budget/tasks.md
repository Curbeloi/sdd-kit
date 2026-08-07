# Tasks: fix-arch-hang-and-corpus-budget

> Created: 2026-08-07 | Author: René Hechavarría <reneluishs@gmail.com>
> Feature: sdd arch no termina el proceso tras exito, y falla con corpus grandes sin decir por que

## Context

Arreglar los dos bugs de sdd arch: el proceso que nunca sale tras un run exitoso, y el fallo con corpus grandes que reportaba "unknown error". Incluye el archivado masivo de specs para que el corpus deje de crecer sin limite.

## Tasks

### 1. Salida determinista del proceso

- [x] **1.1** Leer el costo desde total_cost_usd con los campos viejos como fallback `src/core/generator.js` <- R1
- [x] **1.2** Emitir la senal de fin desde un unico settle al cerrar el hijo, no desde la forma del evento `src/core/generator.js` <- R1
- [x] **1.3** Aplicar unref al heartbeat del spinner y hacer stop idempotente `src/core/progress.js` <- R1
- [x] **1.4** Mover el cleanup del progreso a finally en el comando arch `src/commands/arch.js` <- R1
- [x] **1.5** Cerrar streams y terminar el hijo con SIGTERM escalando a SIGKILL `src/core/generator.js` <- R2
- [x] **1.6** Limpiar el timer de timeout tambien en el camino de error del provider CLI `src/core/providers/cli-provider.js` <- R2
- [x] **1.7** Envolver el heartbeat de refresh en try/finally y aplicarle unref `src/commands/spec/refresh.js` <- R2
- [x] **1.8** Crear el helper de apagado que drena stdio antes de salir `src/core/shutdown.js` <- R2
- [x] **1.9** Pasar a parseAsync, devolver las promesas de cada accion y salir al terminar `src/cli.js` <- R2

### 2. Errores accionables

- [x] **2.1** Extraer el error real de stdout: evento result, errors y turnos de error de API `src/core/generator.js` <- R3
- [x] **2.2** Clasificar contexto excedido y tope de gasto agotado como causas distintas `src/core/generator.js` <- R3
- [x] **2.3** Mostrar la causa y el remedio concreto en el comando arch `src/commands/arch.js` <- R3

### 3. Presupuesto del corpus

- [x] **3.1** Crear el constructor de prompt con presupuesto y degradacion por tiers `src/core/arch-prompt.js` <- R4
- [x] **3.2** Exponer mtime en los specs para poder omitir los mas antiguos primero `src/core/spec-reader.js` <- R4
- [x] **3.3** Enviar el prompt por stdin en el descriptor de claude `src/core/generator.js` <- R4
- [x] **3.4** Reportar al usuario cuando el corpus se recorto y cuanto se omitio `src/commands/arch.js` <- R4
- [x] **3.5** Añadir arch_max_prompt_chars a la config con fallback ante valores invalidos `src/core/config.js` <- R4

### 4. Ciclo de vida del corpus

- [x] **4.1** Añadir archivado masivo por completados, por fecha y en modo dry-run `src/commands/spec/archive.js` <- R5
- [x] **4.2** Registrar los flags nuevos y validar la fecha en el CLI `src/cli.js` <- R5
- [x] **4.3** Añadir agent_max_budget_usd a la config y usarlo en arch `src/core/config.js` <- R6
- [x] **4.4** Mostrar las claves de config nuevas en sdd config `src/commands/config.js` <- R6

### 5. Tests y documentacion

- [x] **5.1** Tests del presupuesto: degradacion, orden por recencia y omision reportada `src/core/arch-prompt.test.js` <- R4
- [x] **5.2** Tests de extraccion de error con los payloads reales capturados del CLI `src/core/generator.test.js` <- R3
- [x] **5.3** Test de regresion de ciclo de vida: los comandos salen y no truncan output `src/cli.test.js` <- R2
- [x] **5.4** Tests de seleccion y archivado masivo, incluyendo el spec sin tareas `src/commands/spec/archive.test.js` <- R5
- [x] **5.5** Tests de las claves de config nuevas y sus fallbacks `src/core/config.test.js` <- R4
- [x] **5.6** Documentar archivado masivo, presupuesto y tope de gasto `README.md` <- R5

### 6. Dependencias

- [x] **6.1** Subir el piso de node a 22.23 LTS y fijar pnpm 11.9.0 `package.json` <- R2
- [x] **6.2** Actualizar chalk, commander, ora, openai y el SDK de Anthropic a sus majores actuales `package.json` <- R2
- [x] **6.3** Ajustar la matriz de CI a las versiones de node soportadas `.github/workflows/ci.yml` <- R2

## Verification

- [x] **7.1** Verificar que el test de regresion falla contra el codigo pre-fix, no solo que pasa con el fix `src/cli.test.js` <- R2
- [x] **7.2** Correr arch en vivo sobre un repo de 332 specs y confirmar architecture.md valido y salida limpia `specs/_arch/architecture.md` <- R4

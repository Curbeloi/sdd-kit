# Requirements: feat-config

> Created: 2026-03-23 | Author: Hector Curbelo Barrios <hcurbelo@gmail.com>
> Feature: Configuracion .sddrc: sistema de config con defaults, override por archivo y env vars

## Problem

Todos los paths y parametros de sdd-kit estan hardcodeados. Los usuarios no pueden personalizar directorios de specs, concurrencia de API, tamano maximo de archivo, ni profundidad de escaneo.

## Requirements

### R1: Archivo de configuracion .sddrc
- WHEN existe un archivo `.sddrc` en la raiz del proyecto THEN sdd-kit debe leerlo y aplicar la configuracion
- WHEN `.sddrc` no existe THEN usar los defaults actuales sin error

### R2: Schema de configuracion
- WHEN el usuario configura `specs_dir` THEN los specs se leen/escriben en ese directorio
- WHEN el usuario configura `modules_dir` THEN los module specs se guardan ahi
- WHEN el usuario configura `steering_dir` THEN los steering docs se leen/escriben ahi
- WHEN el usuario configura `arch_dir` THEN las vistas de arquitectura se guardan ahi
- WHEN el usuario configura `concurrency` THEN se usa como limite de paralelismo en batchAsk
- WHEN el usuario configura `max_file_size` THEN archivos mayores se saltan en el scanner
- WHEN el usuario configura `max_depth` THEN el scanner no baja mas alla de ese nivel

### R3: Prioridad de configuracion
- Flags de CLI > .sddrc > Variables de entorno > Defaults

### R4: Comando sdd config
- WHEN se ejecuta `sdd config` THEN muestra la configuracion activa con la fuente de cada valor

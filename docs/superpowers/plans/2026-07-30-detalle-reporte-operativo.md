# Detalle operativo del reporte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar el detalle del reporte para priorizar estado, ejecución e historial, dejando la configuración como una sección secundaria editable.

**Architecture:** La página orquesta datos y mutaciones; componentes enfocados presentan cabecera operativa, resumen/configuración e historial. Las reglas de estado, duración e identificadores se concentran en utilidades puras probadas.

**Tech Stack:** React 18, TypeScript, TanStack Query/Router, Tailwind CSS v4, Vitest y Testing Library.

## Global Constraints

- Trabajar en `/Users/andresgaibor/code/javascript/qlik_reportes_creator`.
- Mantener las APIs existentes y no agregar dependencias.
- Usar “reporte” en la experiencia de usuario y Qlik Automate solo como referencia técnica.
- El botón verde queda reservado para ejecutar el reporte.
- Las acciones secundarias deben ser compactas y la configuración debe iniciar contraída.

---

### Task 1: Utilidades operativas

**Files:**
- Create: `apps/web/src/modulos/reportes/utiles-presentacion-reporte.ts`
- Test: `apps/web/src/modulos/reportes/utiles-presentacion-reporte.test.ts`

**Interfaces:**
- Produces: `presentarEstadoEjecucion`, `calcularDuracion`, `abreviarIdEjecucion`, `extraerMensajeError`.

- [ ] Escribir pruebas fallidas para traducción de estados, duración, ID abreviado y errores.
- [ ] Ejecutar Vitest y comprobar que falla por módulo ausente.
- [ ] Implementar las utilidades mínimas.
- [ ] Ejecutar las pruebas y comprobar que pasan.
- [ ] Commit `feat: agregar presentación operativa de ejecuciones`.

### Task 2: Cabecera y resumen operativo

**Files:**
- Modify: `apps/web/src/modulos/reportes/componentes/tarjeta-detalle-automatizacion.tsx`
- Test: `apps/web/src/modulos/reportes/componentes/tarjeta-detalle-automatizacion.test.tsx`

**Interfaces:**
- Consumes: utilidades de presentación de Task 1.
- Produces: cabecera con estado, última ejecución, metadatos y acciones primarias/secundarias.

- [ ] Escribir pruebas fallidas para estado en español, acción principal y resumen de última ejecución.
- [ ] Ejecutar Vitest y confirmar el fallo esperado.
- [ ] Rehacer el componente con jerarquía operativa y acciones compactas.
- [ ] Ejecutar pruebas y typecheck.
- [ ] Commit `feat: priorizar operación en detalle de reporte`.

### Task 3: Configuración secundaria editable

**Files:**
- Create: `apps/web/src/modulos/reportes/componentes/resumen-configuracion-reporte.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx`
- Test: `apps/web/src/modulos/reportes/componentes/resumen-configuracion-reporte.test.tsx`

**Interfaces:**
- Consumes: `ConfiguracionReporte` y callback asíncrono de guardado.
- Produces: resumen compacto, botón Editar configuración, formulario expandible y cancelación.

- [ ] Escribir prueba fallida del resumen contraído y expansión al editar.
- [ ] Ejecutar Vitest y confirmar el fallo esperado.
- [ ] Implementar el componente y modo integrado compacto del formulario.
- [ ] Reordenar la página: cabecera, configuración resumida, historial y contenido técnico administrativo.
- [ ] Ejecutar pruebas y typecheck.
- [ ] Commit `feat: convertir configuración en sección secundaria`.

### Task 4: Historial útil y responsive

**Files:**
- Modify: `apps/web/src/modulos/reportes/componentes/lista-ejecuciones.tsx`
- Test: `apps/web/src/modulos/reportes/componentes/lista-ejecuciones.test.tsx`

**Interfaces:**
- Consumes: utilidades de Task 1 y `EjecucionResumen[]`.
- Produces: historial en español con ID abreviado, duración, errores y versión móvil.

- [ ] Escribir pruebas fallidas para estados traducidos, duración e información de error.
- [ ] Ejecutar Vitest y confirmar el fallo esperado.
- [ ] Implementar tabla de escritorio y tarjetas móviles sin duplicar semántica.
- [ ] Ejecutar pruebas y typecheck.
- [ ] Commit `feat: mejorar historial de ejecuciones`.

### Task 5: Verificación integral

**Files:**
- Modify only if needed: archivos de las tareas anteriores.

**Interfaces:**
- Consumes: todos los componentes implementados.
- Produces: build verificable sin regresiones conocidas.

- [ ] Ejecutar pruebas específicas de reportes.
- [ ] Ejecutar `bun run --cwd apps/web typecheck`.
- [ ] Ejecutar `bun run --cwd apps/web build`.
- [ ] Ejecutar `bun run lint` sobre los archivos modificados y corregir hallazgos.
- [ ] Revisar visualmente la composición mediante el servidor local o captura disponible.
- [ ] Commit final solo si la verificación requiere ajustes.

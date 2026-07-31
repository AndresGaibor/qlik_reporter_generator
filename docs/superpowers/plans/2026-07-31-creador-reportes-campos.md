# Creador de reportes orientado a campos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el creador BigQuery en un flujo claro de selección de campos, periodo, vista previa y confirmación.

**Architecture:** La página conserva consultas y guardado, pero delega presentación y reglas puras en componentes pequeños. La estimación se dispara con valores diferidos y la vista previa se limita a un subconjunto legible.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, React DayPicker, Tailwind v4.

## Global Constraints

- Mantener la ruta y los endpoints existentes.
- Mantener el modo integrado del editor.
- Usar tokens `ink`, `line`, `surface`, `app`, `brand` y `obj`.
- No añadir dependencias.
- Aplicar TDD y commits separados.

---

### Task 1: Reglas puras del creador

**Files:**
- Create: `apps/web/src/modulos/reportes/utiles-creador-reporte.ts`
- Test: `apps/web/src/modulos/reportes/utiles-creador-reporte.test.ts`

- [ ] Probar selección inicial máxima de 12 campos, detección de fechas, costo humano, bytes humanos y requisito pendiente.
- [ ] Ejecutar la prueba y confirmar RED.
- [ ] Implementar las funciones puras mínimas.
- [ ] Ejecutar la prueba y confirmar GREEN.
- [ ] Commit `feat: definir reglas del creador de reportes`.
### Task 2: Selector de campos y vista previa

**Files:**
- Create: `apps/web/src/modulos/reportes/componentes/selector-campos-reporte.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/vista-previa-reporte.tsx`
- Test: `apps/web/src/modulos/reportes/componentes/selector-campos-reporte.test.tsx`

- [ ] Probar búsqueda, filtros por tipo, selección visible y contador.
- [ ] Confirmar RED.
- [ ] Implementar lista vertical accesible y vista previa de máximo ocho columnas.
- [ ] Confirmar GREEN y ausencia de `slate-*`.
- [ ] Commit `feat: separar campos y vista previa del reporte`.

### Task 3: Periodo y validación

**Files:**
- Create: `apps/web/src/modulos/reportes/componentes/selector-periodo-reporte.tsx`
- Test: `apps/web/src/modulos/reportes/componentes/selector-periodo-reporte.test.tsx`

- [ ] Probar columna de fecha, rangos rápidos, rango personalizado y campo requerido.
- [ ] Confirmar RED.
- [ ] Implementar selector de fecha y DayPicker bajo demanda.
- [ ] Confirmar GREEN.
- [ ] Commit `feat: hacer explícito el periodo del reporte`.

### Task 4: Estimación diferida y resumen final

**Files:**
- Create: `apps/web/src/modulos/reportes/hooks/use-valor-diferido.ts`
- Create: `apps/web/src/modulos/reportes/componentes/resumen-creacion-reporte.tsx`
- Test: `apps/web/src/modulos/reportes/hooks/use-valor-diferido.test.tsx`
- Test: `apps/web/src/modulos/reportes/componentes/resumen-creacion-reporte.test.tsx`

- [ ] Probar debounce de 450 ms y mensajes de requisito pendiente.
- [ ] Confirmar RED.
- [ ] Implementar valor diferido, costo legible y resumen de requisitos.
- [ ] Confirmar GREEN.
- [ ] Commit `feat: resumir costo y requisitos del reporte`.
### Task 5: Integrar y reducir el orquestador

**Files:**
- Modify: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-nueva-bigquery.test.ts`

- [ ] Probar que la página usa los componentes extraídos, no contiene `slate-*` y permanece por debajo de 360 líneas.
- [ ] Confirmar RED.
- [ ] Integrar nombre sugerido editable, selección inicial, columna de fecha, componentes y estimación diferida.
- [ ] Añadir errores visibles de detalle, preview y estimación sin cambiar los endpoints.
- [ ] Confirmar GREEN y compatibilidad con modo integrado.
- [ ] Commit `refactor: simplificar creador de reportes BigQuery`.

### Task 6: Verificación final

- [ ] Ejecutar pruebas del módulo de reportes.
- [ ] Ejecutar toda la suite del frontend.
- [ ] Ejecutar Biome sobre archivos modificados.
- [ ] Ejecutar TypeScript en contratos, API y frontend.
- [ ] Ejecutar build completo.
- [ ] Revisar el diff y confirmar que no se añadieron archivos ajenos.
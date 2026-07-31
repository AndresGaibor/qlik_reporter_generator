# Lista operativa de reportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compactar la lista de reportes y mostrar estado y última ejecución con acciones jerarquizadas.

**Architecture:** El contrato de resumen expondrá datos ya presentes en la respuesta de Qlik, sin consultas N+1. La web transformará esos datos mediante utilidades puras y renderizará una lista responsive dentro de un único contenedor.

**Tech Stack:** TypeScript, Bun, Zod, React 18, TanStack Query, Tailwind CSS, Vitest.

## Global Constraints

- Mantener la cabecera y navegación existentes.
- Usar `reportes` en el texto visible.
- No añadir dependencias.
- Solo `Ejecutar reporte` será acción verde dentro de una fila.
- La búsqueda automática tendrá 350 ms de espera.

---

### Task 1: Exponer la última ejecución en el resumen

**Files:**
- Modify: `packages/contratos/src/automatizaciones/panel.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.ts`
- Create: `apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts`

**Interfaces:**
- Produces optional fields `ultimaEjecucionEstado`, `ultimaEjecucionInicio`, `ultimaEjecucionFin` in `ResumenAutomatizacion`.

- [ ] **Step 1: Write the failing mapper test**

Create a Bun test that maps an automation with `lastRun` and asserts the three new fields.

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts`
Expected: FAIL because the fields do not exist.

- [ ] **Step 3: Extend schema and mapper**

Add the optional Zod fields and map `lastRun ?? lastExecution`, with `lastRunAt` and `lastRunStatus` as fallback.

- [ ] **Step 4: Run test, contract and API typecheck**

Run: `bun test apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts && bun run --cwd packages/contratos typecheck && bun run --cwd apps/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contratos/src/automatizaciones/panel.ts \
  apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.ts \
  apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts
git commit -m "feat: exponer última ejecución en reportes"
```

### Task 2: Crear la fila operativa compacta

**Files:**
- Modify: `apps/web/src/compartido/utiles/automatizaciones.ts`
- Create: `apps/web/src/compartido/utiles/automatizaciones.test.ts`
- Modify: `apps/web/src/modulos/reportes/componentes/lista-automatizaciones.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/lista-automatizaciones.test.tsx`

**Interfaces:**
- Consumes the three optional last-run fields from Task 1.
- Produces `estadoVisual`, `claseEstado` and `resumenUltimaEjecucion` for the list component.

- [ ] **Step 1: Write failing utility tests**

Assert `Disponible`, `En ejecución`, `Requiere atención`, `Inactivo`, and a readable completed-run summary with duration.

- [ ] **Step 2: Run utility tests and verify RED**

Run: `bun run --cwd apps/web test:run src/compartido/utiles/automatizaciones.test.ts`
Expected: FAIL for the new state rules and missing summary function.

- [ ] **Step 3: Implement utility behavior**

Use `presentarEstadoEjecucion`, `calcularDuracion`, and `formatearFechaYHora`; return `Aún no se ha ejecutado` when no execution exists.

- [ ] **Step 4: Write failing component tests**

Render two reports and assert compact column labels, `Ejecutar reporte`, `Ver detalle`, hidden Qlik action, and absence of `Funcionando` and `Última modificación`.

- [ ] **Step 5: Run component tests and verify RED**

Run: `bun run --cwd apps/web test:run src/modulos/reportes/componentes/lista-automatizaciones.test.tsx`
Expected: FAIL because the current component renders tall cards and permanent technical actions.

- [ ] **Step 6: Implement the compact list**

Use one bordered container, a desktop-only column header, responsive report rows, two visible actions, and a `details` menu for Qlik Cloud.

- [ ] **Step 7: Run tests and web typecheck**

Run: `bun run --cwd apps/web test:run src/compartido/utiles/automatizaciones.test.ts src/modulos/reportes/componentes/lista-automatizaciones.test.tsx && bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/compartido/utiles/automatizaciones.ts \
  apps/web/src/compartido/utiles/automatizaciones.test.ts \
  apps/web/src/modulos/reportes/componentes/lista-automatizaciones.tsx \
  apps/web/src/modulos/reportes/componentes/lista-automatizaciones.test.tsx
git commit -m "feat: compactar lista operativa de reportes"
```

### Task 3: Compactar filtros y paginación

**Files:**
- Modify: `apps/web/src/modulos/reportes/componentes/barra-filtros-automatizaciones.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/barra-filtros-automatizaciones.test.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-automatizaciones.tsx`
- Modify: `apps/web/src/modulos/reportes/componentes/paginacion-lista.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/paginacion-lista.test.tsx`
- Create: `apps/web/src/modulos/reportes/hooks/use-busqueda-diferida.ts`
- Create: `apps/web/src/modulos/reportes/hooks/use-busqueda-diferida.test.tsx`

**Interfaces:**
- `BarraFiltrosAutomatizaciones` receives the current text and setters, but no permanent submit action.
- `PaginaAutomatizaciones` synchronizes `busquedaTemp` to `busquedaActiva` after 350 ms.

- [ ] **Step 1: Write the failing filter test**

Render the filter bar and assert that it contains the space selector and search field, but no visible `Buscar` button.

- [ ] **Step 2: Run the test and verify RED**

Run: `bun run --cwd apps/web test:run src/modulos/reportes/componentes/barra-filtros-automatizaciones.test.tsx`
Expected: FAIL because the current component renders the button.

- [ ] **Step 3: Implement compact filters and debounce**

Remove the submit button, add an inline search icon, preserve clearing and Enter submission, and isolate the 350 ms synchronization in `useBusquedaDiferida` with fake-timer coverage.

- [ ] **Step 4: Update and test pagination copy and styling**

Replace `automatizaciones` with `reportes`, reduce padding, border contrast and shadow, and verify the visible copy with a component test.

- [ ] **Step 5: Run full verification**

Run: `bun test apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts && bun run --cwd apps/web test:run && bun run typecheck && bun run build && bunx biome check <touched-files>`
Expected: all feature and package tests pass; only the existing non-blocking Vite bundle-size warning may remain.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/compartido/utiles/automatizaciones.ts \
  apps/web/src/compartido/utiles/automatizaciones.test.ts \
  apps/web/src/modulos/reportes/componentes/barra-filtros-automatizaciones.tsx \
  apps/web/src/modulos/reportes/componentes/barra-filtros-automatizaciones.test.tsx \
  apps/web/src/modulos/reportes/componentes/paginacion-lista.tsx \
  apps/web/src/modulos/reportes/componentes/paginacion-lista.test.tsx \
  apps/web/src/modulos/reportes/hooks/use-busqueda-diferida.ts \
  apps/web/src/modulos/reportes/hooks/use-busqueda-diferida.test.tsx \
  apps/web/src/modulos/reportes/pagina-automatizaciones.tsx \
  docs/superpowers/plans/2026-07-30-lista-reportes-operativa.md
git commit -m "refactor: simplificar filtros de reportes"
```

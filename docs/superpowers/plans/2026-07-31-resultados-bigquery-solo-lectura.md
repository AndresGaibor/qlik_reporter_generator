# Catálogo de Resultados BigQuery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/tablas` en un catálogo BigQuery de solo lectura, compacto, real y coherente con el sistema visual del proyecto.

**Architecture:** La página será un orquestador de consultas y selección. La presentación se divide en componentes pequeños: cabecera/contexto, catálogo, detalle, esquema, vista previa y estados. Toda la información proviene de los endpoints de destinos existentes; no habrá mutaciones ni datos ficticios.

**Tech Stack:** React 18, TypeScript, TanStack Query/Router, Tailwind CSS v4, Vitest, Bun.

## Global Constraints

- Trabajar directamente en `main`, autorizado por el usuario.
- Usar solo datos reales del API; eliminar simulaciones y contenido inventado.
- Mostrar únicamente conexiones BigQuery y seleccionar la predeterminada o la primera disponible.
- Mantener la ruta `/tablas` y el enlace hacia `/reportes/nueva`.
- Usar tokens `brand`, `ink`, `line`, `surface`, `app`, `obj`; no usar `slate-*`.
- Mantener accesibilidad de teclado, estados `aria-live` y diseño responsive.
- No crear ni editar tablas BigQuery desde esta pantalla.

---

### Task 1: Utilidades de presentación y contrato visual

**Files:**
- Create: `apps/web/src/modulos/tablas/utiles-resultados.ts`
- Test: `apps/web/src/modulos/tablas/utiles-resultados.test.ts`

**Interfaces:**
- Produces: `filtrarRecursos`, `obtenerColumnasPreview`, `formatearValorResultado`, `formatearFechaResultado`.

- [ ] Escribir pruebas que cubran búsqueda sin distinguir mayúsculas, columnas estables de preview, valores nulos/objetos y fechas inválidas.
- [ ] Ejecutar la prueba y confirmar RED por módulo inexistente.
- [ ] Implementar las utilidades puras mínimas.
- [ ] Ejecutar la prueba y confirmar GREEN.
- [ ] Commit: `feat: agregar utilidades del catálogo BigQuery`.

### Task 2: Componentes del catálogo y estados

**Files:**
- Create: `apps/web/src/modulos/tablas/componentes/catalogo-resultados.tsx`
- Create: `apps/web/src/modulos/tablas/componentes/estado-resultados.tsx`
- Test: `apps/web/src/modulos/tablas/componentes/catalogo-resultados.test.tsx`

**Interfaces:**
- Consumes: `RecursoDestino`, búsqueda y selección controladas.
- Produces: catálogo accesible con filas compactas y estados de configuración/vacío/error.

- [ ] Escribir pruebas de cantidad, selección, búsqueda vacía y estado sin BigQuery.
- [ ] Confirmar RED.
- [ ] Implementar catálogo y estados con tokens del sistema.
- [ ] Confirmar GREEN.
- [ ] Commit: `feat: crear catálogo compacto de resultados`.

### Task 3: Detalle, esquema y vista previa

**Files:**
- Create: `apps/web/src/modulos/tablas/componentes/detalle-resultado.tsx`
- Create: `apps/web/src/modulos/tablas/componentes/tabla-esquema.tsx`
- Create: `apps/web/src/modulos/tablas/componentes/tabla-preview.tsx`
- Test: `apps/web/src/modulos/tablas/componentes/detalle-resultado.test.tsx`

**Interfaces:**
- Consumes: detalle real, filas de preview, estado de carga/error y callback de pestaña.
- Produces: resumen operativo, pestañas Campos/Vista previa y acción `Crear reporte con esta tabla`.

- [ ] Escribir pruebas de metadatos, enlace al creador, pestañas, null y ausencia de acciones administrativas.
- [ ] Confirmar RED.
- [ ] Implementar componentes separados y responsive.
- [ ] Confirmar GREEN.
- [ ] Commit: `feat: crear detalle de resultados BigQuery`.

### Task 4: Orquestación de `/tablas`

**Files:**
- Rewrite: `apps/web/src/modulos/tablas/pagina-tablas-destino.tsx`
- Test: `apps/web/src/modulos/tablas/pagina-tablas-destino.test.ts`

**Interfaces:**
- Consumes: API existente de conexiones, recursos, detalle y preview.
- Produces: página de catálogo de solo lectura.

- [ ] Escribir auditoría que falle mientras existan simulaciones, `slate-*`, creación/edición/aprobaciones/historial ficticio o archivo monolítico excesivo.
- [ ] Confirmar RED.
- [ ] Reescribir la página como orquestador, usando BigQuery predeterminada y selección estable.
- [ ] Añadir estados reales: sin conexión, conexión con error, catálogo vacío, error de catálogo, sin selección y error de detalle/preview.
- [ ] Confirmar GREEN.
- [ ] Commit: `refactor: convertir resultados en catálogo BigQuery`.

### Task 5: Pulido integral y verificación

**Files:**
- Modify only files required by findings in `apps/web/src/modulos/tablas/`.

- [ ] Revisar copy, foco, etiquetas, overflow horizontal y comportamiento móvil.
- [ ] Ejecutar `bun run --cwd apps/web test:run`.
- [ ] Ejecutar typecheck de contratos, API y web.
- [ ] Ejecutar build completo.
- [ ] Ejecutar Biome sobre los archivos modificados.
- [ ] Auditar que no existan textos simulados ni clases `slate-*` en el módulo.
- [ ] Commit final: `refactor: pulir experiencia de resultados BigQuery`.

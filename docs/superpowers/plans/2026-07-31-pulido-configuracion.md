# Pulido final de Configuración Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulir `/configuracion` para reducir duplicaciones, compactar el estado completo y sincronizar la navegación lateral con el scroll.

**Architecture:** Mantener los componentes actuales y añadir utilidades pequeñas para presentación. El resumen gestionará su expansión localmente; la navegación observará las secciones existentes; Qlik y plantilla recibirán valores humanos ya normalizados.

**Tech Stack:** React 18, TypeScript, TanStack Query, Tailwind CSS, Vitest, Biome.

## Global Constraints

- No cambiar endpoints ni contratos del backend.
- No incluir archivos ajenos o no rastreados en los commits.
- Mantener textos en español y tokens visuales existentes.
- Aplicar TDD y commits separados por comportamiento.

---
### Task 1: Resumen compacto

**Files:**
- Modify: `apps/web/src/modulos/admin/componentes/resumen-configuracion.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/resumen-configuracion.test.tsx`

- [ ] Escribir pruebas para estado 100% compacto, expansión manual y detalle visible cuando existe una alerta.
- [ ] Ejecutar la prueba y confirmar el fallo.
- [ ] Implementar el encabezado compacto con `aria-expanded` y panel de detalle condicional.
- [ ] Ejecutar prueba y Biome.
- [ ] Commit: `refactor: compactar resumen de configuración`.

### Task 2: Navegación sincronizada

**Files:**
- Modify: `apps/web/src/modulos/admin/componentes/navegacion-configuracion.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/navegacion-configuracion.test.tsx`

- [ ] Escribir prueba con `IntersectionObserver` simulado para cambiar `aria-current`.
- [ ] Ejecutar la prueba y confirmar el fallo.
- [ ] Observar `general`, `qlik`, `oauth`, `plantilla`, `bigquery` y `usuarios`, manteniendo hash y clics.
- [ ] Ejecutar prueba y Biome.
- [ ] Commit: `feat: sincronizar navegación de configuración`.
### Task 3: Copia y jerarquía visual

**Files:**
- Modify: `apps/web/src/modulos/admin/utiles-estado-configuracion.ts`
- Modify: `apps/web/src/modulos/admin/utiles-estado-configuracion.test.ts`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-qlik-cloud.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/resumen-plantilla-base.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/resumen-oauth.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-bigquery.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-info-tenant.tsx`

- [ ] Probar singular/plural de usuarios y nombres normalizados.
- [ ] Confirmar el fallo de la copia antigua.
- [ ] Eliminar host duplicado, mostrar alias humano y reducir altura de General.
- [ ] Cambiar acciones de mantenimiento a `outline`.
- [ ] Ejecutar pruebas de configuración y Biome.
- [ ] Commit: `refactor: pulir detalles visuales de configuración`.

### Task 4: Verificación final

- [ ] Ejecutar `bun run --cwd apps/web test:run`.
- [ ] Ejecutar Biome sobre todos los archivos modificados.
- [ ] Ejecutar `bun run typecheck`.
- [ ] Ejecutar `bun run build`.
- [ ] Revisar `git status --short` y confirmar que solo queden archivos ajenos preexistentes.

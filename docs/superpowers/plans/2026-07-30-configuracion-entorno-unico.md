# Configuración de entorno único Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/configuracion` en la administración directa del único entorno y retirar por completo la UI de organizaciones y conexiones técnicas.

**Architecture:** El modelo interno de organización permanece intacto. El frontend resuelve la primera organización activa mediante el API administrativo y reutiliza las secciones actuales de detalle. Las rutas antiguas se conservan como redirecciones para enlaces guardados.

**Tech Stack:** React 18, TypeScript, TanStack Router, TanStack Query, Vitest, Bun, Biome.

## Global Constraints

- No mostrar lista, creación ni eliminación de organizaciones.
- No mostrar el catálogo de conexiones JDBC/SFTP ni enlaces hacia él.
- Mantener `Superadmins` como administración global separada.
- Mantener compatibilidad con `/admin/tenants` y `/admin/tenants/:tenantId` mediante redirección.
- Conservar el modelo interno y endpoints del backend sin migraciones.

---

### Task 1: Resolver y presentar la configuración única

**Files:**
- Create: `apps/web/src/modulos/admin/pagina-configuracion.tsx`
- Create: `apps/web/src/modulos/admin/utiles-configuracion.ts`
- Test: `apps/web/src/modulos/admin/utiles-configuracion.test.ts`
- Modify: `apps/web/src/modulos/admin/pagina-detalle-tenant.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-info-tenant.tsx`

**Interfaces:**
- `seleccionarConfiguracionPrincipal(tenants: TenantResumen[]): TenantResumen | undefined` elige primero una organización activa y usa la primera como respaldo.
- `PaginaDetalleTenant` acepta `modoConfiguracion?: boolean` para ocultar breadcrumb y lenguaje de organizaciones.

- [ ] Escribir una prueba que exija seleccionar primero la configuración activa y devolver `undefined` para una lista vacía.
- [ ] Ejecutar `bun run --cwd apps/web test:run src/modulos/admin/utiles-configuracion.test.ts` y comprobar que falla.
- [ ] Implementar el selector y `PaginaConfiguracion`, que consulta `obtenerTenants()` y renderiza `PaginaDetalleTenant` en modo configuración.
- [ ] Cambiar textos visibles de “organización” por “plataforma” o “configuración general”.
- [ ] Ejecutar la prueba y el typecheck web.
- [ ] Commit: `feat: centralizar configuración del entorno`.

### Task 2: Simplificar navegación y conservar rutas antiguas

**Files:**
- Create: `apps/web/src/app/navegacion.ts`
- Test: `apps/web/src/app/navegacion.test.ts`
- Modify: `apps/web/src/app/layout-principal.tsx`
- Modify: `apps/web/src/modulos/admin/rutas.tsx`
- Modify: `apps/web/src/modulos/tablas/rutas.tsx`
- Modify: `apps/web/src/modulos/inicio/pagina-inicio.tsx`

**Interfaces:**
- `NAVEGACION` deja de contener `/admin/tenants`.
- `/configuracion` usa `PaginaConfiguracion`.
- Las dos rutas `/admin/tenants` redirigen a `/configuracion`.

- [ ] Escribir una prueba que compruebe que `NAVEGACION` contiene Configuración y no contiene Organizaciones.
- [ ] Ejecutar la prueba y comprobar que falla.
- [ ] Extraer la definición de navegación, cambiar la ruta de configuración y crear redirecciones heredadas.
- [ ] Actualizar el acceso rápido de Inicio para apuntar a `/configuracion` y retirar referencias a organizaciones, destinos y conexiones.
- [ ] Ejecutar prueba, typecheck y build web.
- [ ] Commit: `refactor: simplificar navegación administrativa`.

### Task 3: Retirar el catálogo de conexiones

**Files:**
- Modify: `apps/web/src/modulos/flujos/pagina-detalle-flujo.tsx`
- Delete: `apps/web/src/modulos/origenes/pagina-catalogo-origen.tsx`
- Modify: `apps/web/src/modulos/tablas/rutas.tsx`
- Test: `apps/web/src/modulos/flujos/pagina-detalle-flujo-conexiones.test.ts`

**Interfaces:**
- El detalle de Dataflow no genera URLs con parámetros `conexion`.
- La pestaña Spark no muestra advertencia ni CTA de catálogo técnico.

- [ ] Escribir una prueba de fuente que exija ausencia de `Ir a Configuración de Conexiones`, `urlCatalogoConexiones` y `Conexiones para automatizaciones`.
- [ ] Ejecutar la prueba y comprobar que falla.
- [ ] Eliminar helper, aviso y CTA del detalle de Dataflow; eliminar la pantalla de catálogo y su importación.
- [ ] Buscar en `apps/web/src` y confirmar que no quedan los textos retirados.
- [ ] Ejecutar Vitest completo, typecheck, build y Biome sobre archivos modificados.
- [ ] Commit: `refactor: retirar catálogo de conexiones`.

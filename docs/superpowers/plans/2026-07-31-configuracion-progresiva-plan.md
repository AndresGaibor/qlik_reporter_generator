# Configuración progresiva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/configuracion` en un panel operativo compacto con resumen global, navegación interna y edición bajo demanda para Qlik, OAuth, plantilla, BigQuery y usuarios.

**Architecture:** Mantener una sola ruta y el modelo de datos actual. `PaginaDetalleTenant` coordinará un resumen superior y secciones identificables; cada integración conservará su lógica de consulta/mutación, pero separará estado de consulta y edición mediante componentes pequeños. Los cambios sensibles permanecerán explícitos y confirmados.

**Tech Stack:** React 18, TypeScript, TanStack Query, TanStack Router, Tailwind CSS, Vitest, Bun, Biome.

## Global Constraints

- Trabajar directamente en `main` por autorización expresa del usuario.
- No modificar contratos ni endpoints salvo que una prueba demuestre que es imprescindible.
- Mantener los tokens visuales existentes: `brand`, `ink`, `line`, `surface`, `app`, `obj`.
- No exponer secretos OAuth ni el JSON BigQuery guardado.
- No incluir en commits archivos ajenos ya modificados o no rastreados.
- Todos los comportamientos nuevos deben seguir RED → GREEN → REFACTOR.

---

### Task 1: Modelo de estado y resumen global

**Files:**
- Create: `apps/web/src/modulos/admin/utiles-estado-configuracion.ts`
- Create: `apps/web/src/modulos/admin/utiles-estado-configuracion.test.ts`
- Create: `apps/web/src/modulos/admin/componentes/resumen-configuracion.tsx`
- Create: `apps/web/src/modulos/admin/componentes/resumen-configuracion.test.tsx`
- Modify: `apps/web/src/modulos/admin/pagina-detalle-tenant.tsx`

**Interfaces:**
- Produces: `crearResumenConfiguracion(params): ItemResumenConfiguracion[]`.
- Produces: `ResumenConfiguracion` con enlaces a anclas y estados textuales.

- [ ] Escribir pruebas para estados Qlik, OAuth, plantilla, BigQuery y usuarios.
- [ ] Ejecutar pruebas y confirmar fallo por módulos inexistentes.
- [ ] Implementar utilidades puras y el resumen accesible.
- [ ] Integrar el resumen en la cabecera de Configuración.
- [ ] Ejecutar pruebas, TypeScript y Biome.
- [ ] Commit: `feat: resumir estado de configuración`.

### Task 2: Navegación interna y agrupación

**Files:**
- Create: `apps/web/src/modulos/admin/componentes/navegacion-configuracion.tsx`
- Create: `apps/web/src/modulos/admin/componentes/navegacion-configuracion.test.tsx`
- Modify: `apps/web/src/modulos/admin/pagina-detalle-tenant.tsx`

**Interfaces:**
- Consumes: `ItemResumenConfiguracion[]`.
- Produces: navegación sticky en escritorio y horizontal en móvil con `aria-current`.

- [ ] Escribir prueba de enlaces a `#general`, `#qlik`, `#oauth`, `#plantilla`, `#bigquery`, `#usuarios`.
- [ ] Confirmar fallo.
- [ ] Implementar navegación y contenedor de dos columnas.
- [ ] Añadir IDs y `scroll-mt` a cada sección.
- [ ] Ejecutar pruebas, TypeScript y Biome.
- [ ] Commit: `feat: navegar configuración por secciones`.

### Task 3: General y Qlik Cloud con edición bajo demanda

**Files:**
- Modify: `apps/web/src/modulos/admin/componentes/seccion-info-tenant.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-qlik-cloud.tsx`
- Create: `apps/web/src/modulos/admin/componentes/secciones-configuracion.test.tsx`

**Interfaces:**
- `SeccionInfoTenant` muestra nombre y estado; slug y suspensión quedan en acciones avanzadas.
- `SeccionQlikCloud` muestra conexiones existentes y abre el formulario solo con “Agregar entorno”.

- [ ] Escribir pruebas de modo resumen, expansión y cancelación.
- [ ] Confirmar fallo.
- [ ] Implementar edición progresiva y ocultar formularios inactivos.
- [ ] Mantener confirmaciones de suspensión y eliminación.
- [ ] Ejecutar pruebas, TypeScript y Biome.
- [ ] Commit: `refactor: simplificar general y Qlik Cloud`.

### Task 4: OAuth y plantilla compactos

**Files:**
- Modify: `apps/web/src/modulos/admin/componentes/seccion-oauth-qlik.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-automatizacion-base-tenant.tsx`
- Create: `apps/web/src/modulos/admin/componentes/oauth-resumen.test.tsx`

**Interfaces:**
- OAuth configurado inicia en resumen con acciones `Editar configuración` y `Volver a verificar`.
- El formulario conserva Client ID, secreto opcional y scopes; instrucciones y scopes avanzados son desplegables.
- Plantilla configurada inicia compacta y abre el selector con `Cambiar plantilla`.

- [ ] Escribir pruebas para OAuth verificado y plantilla configurada colapsados.
- [ ] Confirmar fallo.
- [ ] Implementar modo resumen/edición y acciones inequívocas.
- [ ] Mantener cifrado y flujo OAuth existentes.
- [ ] Ejecutar pruebas, TypeScript y Biome.
- [ ] Commit: `refactor: compactar OAuth y plantilla base`.

### Task 5: BigQuery progresivo y seguro

**Files:**
- Modify: `apps/web/src/modulos/admin/componentes/seccion-bigquery.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-bigquery.test.tsx`

**Interfaces:**
- Configuración activa inicia en resumen.
- `Editar configuración` abre dataset, selector de archivo `.json` y textarea opcional.
- `Guardar y verificar` guarda cambios y ejecuta la prueba actual.

- [ ] Escribir pruebas de resumen, edición, archivo JSON y cancelación.
- [ ] Confirmar fallo.
- [ ] Implementar estado local seguro sin rellenar secretos guardados.
- [ ] Añadir mensajes claros al reemplazar credenciales.
- [ ] Ejecutar pruebas, TypeScript y Biome.
- [ ] Commit: `refactor: simplificar configuración BigQuery`.

### Task 6: Usuarios, responsive y verificación integral

**Files:**
- Modify: `apps/web/src/modulos/admin/componentes/seccion-usuarios.tsx`
- Create: `apps/web/src/modulos/admin/componentes/seccion-usuarios.test.tsx`
- Modify: `apps/web/src/modulos/admin/pagina-detalle-tenant.tsx`

**Interfaces:**
- Tabla desktop y tarjetas móviles sin scroll horizontal.
- Los cambios de rol deshabilitan controles durante la mutación.
- Quitar acceso permanece confirmado y visualmente secundario.

- [ ] Escribir pruebas de estado vacío, bloqueo durante mutación y presentación móvil.
- [ ] Confirmar fallo.
- [ ] Implementar tabla/tarjetas y feedback de actualización.
- [ ] Auditar foco, `aria-expanded`, `aria-live`, áreas táctiles y textos.
- [ ] Ejecutar `bun run test:run`, typecheck, build y Biome del alcance.
- [ ] Revisar `git diff` para excluir cambios ajenos.
- [ ] Commit: `refactor: completar experiencia de configuración`.

## Verification Checklist

- [ ] La vista inicial comunica el estado de todas las integraciones sin desplazarse por toda la página.
- [ ] Las secciones configuradas no muestran formularios completos por defecto.
- [ ] Todas las ediciones permiten cancelar sin alterar valores persistidos.
- [ ] OAuth y BigQuery no muestran secretos guardados.
- [ ] Las acciones destructivas conservan confirmación.
- [ ] La pantalla funciona sin desbordamiento horizontal en móvil.
- [ ] Pruebas, TypeScript, build y Biome terminan con código 0.

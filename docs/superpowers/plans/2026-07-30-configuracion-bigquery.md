# Configuración BigQuery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a `/configuracion` una sección dedicada para guardar y probar una cuenta de servicio BigQuery mediante su JSON.

**Architecture:** La configuración se modela con contratos Zod específicos. Las rutas administrativas leen y escriben una única conexión BigQuery predeterminada por tenant Qlik; el JSON se cifra en el composition root y las respuestas se sanea. El frontend consume esas rutas con una tarjeta propia y no restaura el administrador genérico de destinos.

**Tech Stack:** Bun, Hono, Drizzle ORM, Zod, React 18, TanStack Query, TypeScript, Vitest.

## Global Constraints

- Nunca devolver `private_key`, el JSON original ni el valor cifrado.
- Conservar las credenciales existentes cuando una edición no envía un JSON nuevo.
- No restaurar PostgreSQL, SFTP, Impala ni una lista genérica de conexiones.
- Derivar `projectId` y `clientEmail` del JSON en el backend; no confiar solo en el navegador.
- Implementar con TDD y commits separados.

---

### Task 1: Contrato BigQuery seguro

**Files:**
- Modify: `packages/contratos/src/admin/index.ts`
- Create: `packages/contratos/src/admin/configuracion-bigquery.test.ts`

**Interfaces:**
- Produces: `ConfigurarBigQuery`, `ConfiguracionBigQuery` y esquemas Zod exportados.
- [ ] **Step 1: Escribir pruebas del contrato**

Validar una cuenta `service_account`, rechazar JSON inválido y comprobar que la respuesta pública solo contiene proyecto, dataset, correo y estado.

- [ ] **Step 2: Ejecutar RED**

Run: `bun test packages/contratos/src/admin/configuracion-bigquery.test.ts`
Expected: FAIL porque los esquemas no existen.

- [ ] **Step 3: Implementar contratos mínimos**

Añadir `esquemaCredencialesBigQuery`, `esquemaConfigurarBigQuery` y `esquemaConfiguracionBigQuery` con dataset obligatorio, credenciales opcionales al editar y límites positivos opcionales.

- [ ] **Step 4: Ejecutar GREEN y typecheck**

Run: `bun test packages/contratos/src/admin/configuracion-bigquery.test.ts && bun run --cwd packages/contratos typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contratos/src/admin/index.ts packages/contratos/src/admin/configuracion-bigquery.test.ts
git commit -m "feat: definir configuración segura de BigQuery"
```

### Task 2: API administrativa BigQuery

**Files:**
- Modify: `apps/api/src/modulos/admin/http/rutas-configuracion-tenant.ts`
- Modify: `apps/api/src/modulos/admin/http/rutas-admin.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts`

**Interfaces:**
- Produces: GET y PUT `.../bigquery` con respuesta `ConfiguracionBigQuery`.
- [ ] **Step 1: Escribir prueba de rutas**

La prueba debe verificar acceso, lectura saneada, creación inicial que exige JSON y actualización que conserva el secreto existente.

- [ ] **Step 2: Ejecutar RED**

Run: `bun test apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts`
Expected: FAIL con rutas inexistentes.

- [ ] **Step 3: Implementar GET y PUT**

Parsear el JSON en el servidor, derivar `projectId` y `clientEmail`, llamar dependencias específicas de lectura/escritura y responder sin secretos.

- [ ] **Step 4: Implementar persistencia cifrada**

En `app.ts`, buscar la conexión BigQuery predeterminada del tenant. Insertar o actualizar; cifrar un JSON nuevo y conservar `secretoRefs` cuando no se envíe otro.

- [ ] **Step 5: Ejecutar GREEN y pruebas del módulo**

Run: `bun test apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts apps/api/src/modulos/admin && bun run --cwd apps/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modulos/admin/http/rutas-configuracion-tenant.ts apps/api/src/modulos/admin/http/rutas-admin.ts apps/api/src/app.ts apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts
git commit -m "feat: guardar credenciales BigQuery cifradas"
```

### Task 3: Tarjeta BigQuery en Configuración

**Files:**
- Modify: `apps/web/src/modulos/admin/api.ts`
- Modify: `apps/web/src/modulos/admin/pagina-detalle-tenant.tsx`
- Create: `apps/web/src/modulos/admin/componentes/seccion-bigquery.tsx`
- Create: `apps/web/src/modulos/admin/componentes/seccion-bigquery.test.tsx`
- Modify: `apps/web/src/modulos/admin/configuracion-sin-conexiones.test.ts`

**Interfaces:**
- Consumes: `ConfiguracionBigQuery`, GET/PUT administrativos y `POST /destinos/conexiones/:id/probar`.
- Produces: `SeccionBigQuery({ organizacionId, tenantQlikId })`.
- [ ] **Step 1: Escribir prueba del componente**

Comprobar que la tarjeta aparece, extrae proyecto/correo del JSON, exige dataset, oculta la clave y permite editar sin reenviar credenciales configuradas.

- [ ] **Step 2: Ejecutar RED**

Run: `bun run --cwd apps/web test:run src/modulos/admin/componentes/seccion-bigquery.test.tsx`
Expected: FAIL porque el componente no existe.

- [ ] **Step 3: Implementar API y formulario**

Añadir funciones de consulta, guardado y prueba. Crear textarea JSON, dataset, resumen del proyecto/correo, estado y botones `Guardar` y `Probar conexión`.

- [ ] **Step 4: Integrar en Configuración**

Renderizar la tarjeta para el tenant Qlik principal. Si no existe un tenant Qlik, explicar que primero debe configurarse Qlik Cloud.

- [ ] **Step 5: Actualizar prueba de alcance**

Mantener la prohibición del administrador genérico, pero exigir la presencia de `SeccionBigQuery`.

- [ ] **Step 6: Verificación completa**

Run: `bun run --cwd apps/web test:run && bun run typecheck && bun run build && bunx biome check packages/contratos/src/admin apps/api/src/modulos/admin apps/api/src/app.ts apps/web/src/modulos/admin`
Expected: PASS; solo puede permanecer la advertencia conocida de tamaño de bundle.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/modulos/admin/api.ts apps/web/src/modulos/admin/pagina-detalle-tenant.tsx apps/web/src/modulos/admin/componentes/seccion-bigquery.tsx apps/web/src/modulos/admin/componentes/seccion-bigquery.test.tsx apps/web/src/modulos/admin/configuracion-sin-conexiones.test.ts docs/superpowers/specs/2026-07-30-configuracion-bigquery-design.md docs/superpowers/plans/2026-07-30-configuracion-bigquery.md
git commit -m "feat: configurar BigQuery desde la interfaz"
```
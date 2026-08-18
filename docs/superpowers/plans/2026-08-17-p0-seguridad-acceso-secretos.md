# P0 Seguridad de acceso y secretos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el acceso anónimo o sin privilegios a conexiones de destino y sacar secretos/clave maestra del repositorio y de PostgreSQL, sin introducir multi-tenancy.

**Architecture:** La aplicación sigue siendo una instancia para una sola empresa. Todas las rutas de destinos exigirán sesión; lectura/preview/estimación estarán disponibles para usuarios autenticados y la administración de conexiones quedará limitada a `admin` o `superadmin`. La clave AES vendrá de configuración externa en producción; PostgreSQL dejará de actuar como almacén de la clave maestra.

**Tech Stack:** Bun, TypeScript, Hono, Zod, Drizzle/PostgreSQL, Bun Test, AES-256-GCM.

## Global Constraints

- Una instalación corresponde a una sola empresa; no añadir aislamiento ni selección multi-tenant.
- `organizacionId` puede permanecer temporalmente como singleton interno; no ampliar su uso.
- No ejecutar consultas BigQuery reales ni operaciones potencialmente facturables durante implementación o tests.
- No imprimir, copiar a logs ni incluir en commits ningún valor secreto existente.
- Mantener el monolito modular actual; no mezclar este P0 con el refactor general de rutas o composition root.
- TDD para cambios de comportamiento: prueba roja → implementación mínima → prueba verde → refactor.

---

## File Map
**Create:**
- `apps/api/src/modulos/destinos/http/rutas-destinos-genericos.test.ts` — matriz de autorización sin tocar BigQuery.
- `apps/api/src/plataforma/seguridad/servicio-cifrado.test.ts` — política de clave externa y cifrado.
- `docs/seguridad/ROTACION-SECRETOS.md` — procedimiento operativo sin valores reales.

**Modify:**
- `apps/api/src/modulos/destinos/http/rutas-destinos-genericos.ts` — resolver de acceso y gates por rol.
- `apps/api/src/app.ts` — conectar el contexto autenticado existente con destinos e inicializar cifrado sin DB.
- `apps/api/src/nucleo/errores/error-aplicacion.ts` — error 403 normalizado.
- `apps/api/src/plataforma/seguridad/servicio-cifrado.ts` — eliminar fallback/persistencia de clave maestra en `app_config`.
- `apps/api/src/plataforma/configuracion/entorno.ts` y `.test.ts` — validar clave de producción.
- `.gitignore` y `.env.example` — proteger artefactos locales y documentar la clave.
- `README.md` — requisito de secreto externo en producción.

**Untrack, preserving local copies:**
- `.env.production`
- `apps/api/local.db`

### Task 1: Fijar la política de autorización de destinos

**Policy:** GET/listado/detalle/capacidades/recursos/preview/DDL y `POST /:id/estimar` requieren cualquier sesión válida. `POST /`, `PUT /:id`, `DELETE /:id` y `POST /:id/probar` requieren `admin` o `superadmin`.
**Interfaces:**
- Produces `ContextoAccesoDestinos = { esSuperadmin: boolean; roles: Array<"admin" | "usuario"> }`.
- Produces `ResolverAccesoDestinos = (c: Context) => Promise<ContextoAccesoDestinos>`.
- `crearRutasDestinosGenericas(...)` recibe `resolverAcceso` como dependencia obligatoria; no acepta headers de organización como autenticación.

- [ ] **Step 1: Write failing authorization tests**

En `rutas-destinos-genericos.test.ts`, montar las rutas con callbacks fake que incrementen contadores y un `resolverAcceso` controlable. Probar al menos esta tabla:

```ts
const lectura = [
  ["GET", "/"], ["GET", "/c1"], ["GET", "/c1/capacidades"],
  ["GET", "/c1/recursos"], ["GET", "/c1/recursos/t1"],
  ["GET", "/c1/recursos/t1/preview"], ["GET", "/c1/recursos/t1/ddl"],
  ["POST", "/c1/estimar"],
] as const;
const administracion = [
  ["POST", "/"], ["PUT", "/c1"], ["DELETE", "/c1"], ["POST", "/c1/probar"],
] as const;
```

Para sesión ausente, `resolverAcceso` debe lanzar `new ErrorNoAutorizado()` y cada endpoint debe responder 401 antes de invocar repositorio/cliente. Para rol `usuario`, los cuatro endpoints de administración deben responder 403.
- [ ] **Step 2: Run the tests and verify RED**

Run:
```bash
bun test apps/api/src/modulos/destinos/http/rutas-destinos-genericos.test.ts
```
Expected: FAIL porque las rutas por ID todavía alcanzan callbacks sin resolver sesión y no existe el gate 403.

- [ ] **Step 3: Add a normalized forbidden error**

En `error-aplicacion.ts`:
```ts
export class ErrorProhibido extends ErrorAplicacion {
  constructor(mensaje = "No tienes permisos para realizar esta operación") {
    super("PROHIBIDO", mensaje, 403);
  }
}
```

- [ ] **Step 4: Implement the minimal access gate**

En `rutas-destinos-genericos.ts`, añadir `ResolverAccesoDestinos` y helpers `exigirSesion()` / `exigirAdministrador()`. El helper de administrador debe permitir `contexto.esSuperadmin || contexto.roles.includes("admin")`; de lo contrario lanza `ErrorProhibido`.

Ejecutar el gate **antes** de `obtenerConexion`, `crearClienteDestino`, cualquier actualización y cualquier lectura de recursos. `POST /:id/estimar` usa sólo `exigirSesion`; no convertirlo en operación administrativa.

- [ ] **Step 5: Run GREEN and commit**

Run: `bun test apps/api/src/modulos/destinos/http/rutas-destinos-genericos.test.ts`
Expected: PASS, sin llamadas a BigQuery.
Commit: `fix(destinos): exigir autenticacion y permisos`
### Task 2: Conectar la autorización con el contexto de sesión real

**Files:**
- Modify: `apps/api/src/app.ts:355-395`
- Test: `apps/api/src/modulos/destinos/http/rutas-destinos-genericos.test.ts`

**Interfaces:**
- Consumes `ContextoSolicitudAutenticado` ya producido por `crearResolverContextoSolicitud`.
- Produces para destinos sólo `{ esSuperadmin, roles }`; `organizacionId` sigue usándose únicamente por compatibilidad del almacenamiento singleton existente.

- [ ] **Step 1: Add a test that accepts `usuario`, `admin` and `superadmin` according to policy**

Usar tres resolvers: `{roles:["usuario"], esSuperadmin:false}`, `{roles:["admin"], esSuperadmin:false}` y `{roles:[], esSuperadmin:true}`. Verificar lectura para los tres y mutación sólo para los dos últimos.

- [ ] **Step 2: Wire `resolverContextoSolicitud` from `app.ts`**

Pasar al factory de destinos:
```ts
async (c: Context) => {
  const contexto = await resolverContextoSolicitud(c);
  return { esSuperadmin: contexto.esSuperadmin, roles: contexto.roles };
}
```

No introducir un segundo resolver de cookies y no confiar en `x-organizacion-id`.

- [ ] **Step 3: Verify**

Run: `bun test apps/api/src/modulos/destinos/http/rutas-destinos-genericos.test.ts apps/api/src/app.test.ts`
Expected: PASS.
Commit: `fix(app): conectar permisos de destinos con la sesion`
### Task 3: Retirar secretos y artefactos locales del índice Git

**Files:**
- Modify: `.gitignore`
- Untrack: `.env.production`, `apps/api/local.db`
- Modify: `.env.example`

- [ ] **Step 1: Prove current tracking state without reading secret contents**

Run:
```bash
git ls-files --error-unmatch .env.production
git ls-files --error-unmatch apps/api/local.db
```
Expected before change: ambos comandos encuentran archivos versionados.

- [ ] **Step 2: Add exact ignore rules**

Añadir:
```gitignore
.env.production
.env.staging
apps/api/local.db
```
Mantener `.env.example` versionado.

- [ ] **Step 3: Remove only from Git index**

Run:
```bash
git rm --cached -- .env.production apps/api/local.db
```
No usar `cat`, `env`, `printenv` ni comandos que revelen valores.

- [ ] **Step 4: Verify and commit**

Run: `git check-ignore -v .env.production apps/api/local.db && git diff --check`
Expected: ambos quedan ignorados y el diff no contiene valores secretos.
Commit: `chore(seguridad): dejar secretos y db local fuera de git`
### Task 4: Sacar la clave maestra de PostgreSQL

**Files:**
- Modify: `apps/api/src/plataforma/seguridad/servicio-cifrado.ts`
- Create: `apps/api/src/plataforma/seguridad/servicio-cifrado.test.ts`
- Modify: `apps/api/src/app.ts:131-133`
- Modify: `apps/api/src/plataforma/configuracion/entorno.ts`
- Modify: `apps/api/src/plataforma/configuracion/entorno.test.ts`

**Interface:**
```ts
type OpcionesInicializacionCifrado = {
  clavePrincipal?: string;
  entorno: "development" | "test" | "production";
};
```
`ServicioCifradoWrapper.inicializar(opciones)` sustituye `inicializarConDb`. En producción una clave ausente falla; en development/test se permite una clave efímera exclusivamente para facilitar tests/desarrollo y nunca se persiste.

- [ ] **Step 1: Write RED tests**

Casos mínimos: clave base64 de 32 bytes cifra/descifra; clave inválida falla; producción sin clave lanza error con nombre `CIFRADO_CLAVE_PRINCIPAL`; development/test sin clave puede inicializarse pero no llama ningún puerto DB.

Run: `bun test apps/api/src/plataforma/seguridad/servicio-cifrado.test.ts`
Expected: FAIL porque el wrapper actual lee/escribe `app_config`.

- [ ] **Step 2: Remove DB fallback and persistence**

Eliminar `CLAVE_CONFIG`, `PuertoConfigCifrado` y toda llamada `db.obtener/db.guardar`. La selección debe ser:
```ts
if (!clavePrincipal && entorno === "production") throw new Error("CIFRADO_CLAVE_PRINCIPAL es obligatoria en production");
const clave = clavePrincipal ?? crypto.randomBytes(32).toString("base64");
```
- [ ] **Step 3: Initialize from typed configuration in `app.ts`**

Usar:
```ts
servicioCifrado.inicializar({
  clavePrincipal: configuracion?.CIFRADO_CLAVE_PRINCIPAL ?? process.env.CIFRADO_CLAVE_PRINCIPAL,
  entorno: configuracion?.NODE_ENV ?? (process.env.NODE_ENV as "development" | "test" | "production") ?? "development",
});
```
La comprobación de producción debe ocurrir incluso si el singleton ya fue inicializado previamente por otro test.

- [ ] **Step 4: Strengthen environment validation**

En `entorno.ts`, validar que si `CIFRADO_CLAVE_PRINCIPAL` existe decodifica exactamente 32 bytes y añadir `superRefine` para exigirla cuando `NODE_ENV === "production"`. Añadir tests de configuración para production sin clave, production con clave válida y clave de longitud inválida.

- [ ] **Step 5: Run GREEN and regression tests**

Run:
```bash
bun test apps/api/src/plataforma/seguridad/servicio-cifrado.test.ts apps/api/src/plataforma/configuracion/entorno.test.ts apps/api/src/app.test.ts
```
Expected: PASS.
Commit: `fix(seguridad): externalizar clave maestra de cifrado`

### Task 5: Documentar una rotación segura de credenciales

**Files:**
- Create: `docs/seguridad/ROTACION-SECRETOS.md`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write the runbook without real values**
El runbook debe separar cuatro credenciales: PostgreSQL, secreto OAuth Qlik, clave/JSON de cuenta de servicio GCP y `CIFRADO_CLAVE_PRINCIPAL`. Para proveedores externos: crear credencial nueva, configurar la app, validar y sólo entonces revocar la anterior.

Para la clave AES indicar explícitamente: **no reemplazarla a ciegas si existen filas cifradas con la clave anterior**. Antes de rotarla se requiere backup y una ventana de mantenimiento para reconfigurar/reemitir secretos cifrados (OAuth Qlik, tokens y credenciales GCP). Si no se ha confirmado ese procedimiento, retirar la clave del Git sigue siendo obligatorio pero su rotación se marca como operación bloqueada para evitar pérdida de acceso a ciphertext existente.

- [ ] **Step 2: Update `.env.example` and README**

Mantener sólo el placeholder:
```env
# Producción: obligatorio. Generar fuera del repositorio con openssl rand -base64 32
CIFRADO_CLAVE_PRINCIPAL=
```
README debe indicar que Docker/producción recibe el valor desde `.env` local, secret manager o variable del entorno del despliegue; nunca desde un archivo versionado.

- [ ] **Step 3: Commit documentation**

Run: `git diff --check && ! git diff | grep -E 'BEGIN (RSA |EC |)PRIVATE KEY|private_key_id|client_secret[^A-Za-z]'`
Expected: no material secreto en el diff.
Commit: `docs(seguridad): documentar gestion y rotacion de secretos`

### Task 6: P0 verification gate

- [ ] **Step 1: Run focused security tests**

```bash
bun test apps/api/src/modulos/destinos/http/rutas-destinos-genericos.test.ts \
  apps/api/src/plataforma/seguridad/servicio-cifrado.test.ts \
  apps/api/src/plataforma/configuracion/entorno.test.ts \
  apps/api/src/app.test.ts
```
Expected: 0 failures.
- [ ] **Step 2: Run compiler and build gates that are independent of the known CI baseline defect**

```bash
bun run typecheck
bun run build
```
Expected: exit 0. No real BigQuery call is permitted.

- [ ] **Step 3: Verify repository hygiene**

```bash
! git ls-files | grep -Fx '.env.production'
! git ls-files | grep -Fx 'apps/api/local.db'
git diff --check
git status --short
```
Expected: the two sensitive artifacts are not tracked; only intended P0 changes remain.

- [ ] **Step 4: Record inherited gates, do not mask them**

Until `2026-08-17-p0-ci-baseline.md` is implemented, root `bun test` and `bun run lint` are known baseline failures from the audit. Do not weaken tests or disable lint to make this P0 appear green. After the CI plan lands, rerun the canonical `bun run verify` and require exit 0.

## Exit Criteria

- Every destination endpoint resolves a valid session before repository/client work.
- Only `admin`/`superadmin` can create, mutate, delete or test destination connections.
- Normal authenticated users retain read/preview/estimate access required by report creation.
- `.env.production` and `apps/api/local.db` are no longer versioned.
- Production cannot start encryption without an external 32-byte AES key.
- PostgreSQL no longer stores or generates the master encryption key.
- No implementation/test step invokes real BigQuery.

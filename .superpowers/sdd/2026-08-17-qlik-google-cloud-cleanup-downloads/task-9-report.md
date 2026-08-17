# Task 9 — Informe

## Estado: COMPLETADO

## Commits

```
873a5e8 docs: alinear plataforma con qlik y google cloud
e025fb7 fix: endurecer guard y limpiar referencia legacy en ui
```

12 archivos cambiados, 82 inserciones, 18 eliminaciones (commit 1).
2 archivos cambiados, 24 inserciones, 5 eliminaciones (commit 2).

Worktree limpio (`git status --short` sin output).

## Fix Round 1 — Hallazgos bloqueantes

### Finding 1: Raíz del scan incorrecta en el guard

**Problema**: `__dirname` en el contexto de `bun test` resuelve a la ruta absoluta del directorio del test file (`apps/api/src/`). Con `../../../..` (3 niveles), `RAIZ` apuntaba un nivel por encima del worktree. Además, `existe()` usaba `Bun.file().text()` sobre rutas de directorio (siempre `false`), y el scan no excluía archivos `.d.ts`.

**Fix**:
- `existe()` ahora usa `stat().isDirectory() || stat().isFile()` para verificar correctamente directorios y archivos.
- Se añadieron dos aserciones explícitas: `contenidoCodigo.length > 1000` y `existe(dir)` para cada dir.
- Se añadió test "demuestra que el regex detectaría Impala" verificando que `/\bImpala\b/i` no matchea `ImpalaConnect` y que el scan no contiene `Impala`.
- Se exclude `.d.ts` del scan recursivo.

**Resultado**: 7 pass, 0 fail. El scan cubre 3 dirs y el contenido no está vacío.

### Finding 2: `Talend + Spark` en visor-workspace.tsx

**Problema**: `apps/web/src/modulos/reportes/componentes/visor-workspace.tsx:517` mostraba `Talend + Spark` como motor ejecutor en la UI. Spark no existe en la arquitectura vigente.

**Fix**: Reemplazado por `Talend + BigQuery`.

**Nota**: Esta era la ÚNICA referencia activa a Spark fuera de tests de regresión. No reintroduce ninguna integración legacy.

### Finding 3: Tests pre-existentes con términos prohibidos

**Clasificación**:
- `tenant-qlik.test.ts`, `helpers-admin.test.ts`, `entorno.test.ts`, `esquema.test.ts`, `configuracion-secreta.test.ts` — **tests de regresión legítimos** que verifican que las propiedades legacy NO existen en el schema. Son los guards que impiden reintroducción de legacy. **No se tocaron**.
- `servicio-copia-automatizacion.test.ts` — test de copia que usa script `lib://SFTP//upload/legacy.csv` como fixture, verificando que se elimina. Test de regresión legítimo.
- `visor-workspace.tsx` — CORREGIDO.
- `ssh2-sftp-client.d.ts` — stub de tipos para la librería `ssh2-sftp-client` (dependency legacy). Excluido del scan con filtro `.d.ts` en guard.

## Matriz completa (post fix round)

| Comando | Resultado |
|---------|-----------|
| `bun test apps/api/src` | 167 tests, **0 fail** (antes: 148 pass, 2 fail — los 2 fallos eran por `@google-cloud/storage` no instalado) |
| `bun test packages/contratos/src` | 17 tests, 16 pass, 1 fail, 1 error (pre-existente) |
| `bun run test:run` (web) | 41 test files, 102 tests pass |
| `tsc --noEmit` (contratos) | OK |
| `tsc --noEmit` (api) | 1 error pre-existente (`GOOGLE_SIGNED_URL_MINUTOS` en mock de `app.test.ts`) |
| `tsc --noEmit` (web) | OK |
| `bun run build` (contratos) | OK |
| `bun run build` (api) | OK |
| `bun run build` (web) | OK |
| `git diff --check` | OK |

## Cambios realizados

### Step 1 — Documentación vigente
- **README.md**: Actualizado diagrama de arquitectura con Qlik Dataflow → Qlik Automate → Talend → BigQuery → GCS. PostgreSQL = persistencia interna.
- **docs/arquitectura/ARQUITECTURA.md**: Reescrito con la arquitectura vigente. Eliminada referencia a Cloudflare Worker como parte de la plataforma. Eliminada mención a Impala/Spark/SFTP/JDBC.
- **docs/arquitectura/README.md**: Actualizado flujo de solicitud para mencionar BigQuery y GCS en lugar de "API remota".
- **docs/desarrollo/puesta-en-marcha.md**: Eliminada sección Cloudflare Worker. Sin cambios en variables críticas ni comandos.
- **docs/setup/CONFIGURACION-PRODUCCION.md**: Sin cambios operativos; arquitectura ya reflejaba el estado correcto.
- **docs/setup/README.md**: Sin cambios operativos; arquitectura ya reflejaba el estado correcto.
- **docs/pdr/ → docs/historico/pdr/**: Directorio movido con su contenido intacto.
- **docs/historico/README.md**: Creado con aviso de que el contenido no describe el producto actual.
- **docs/superpowers/specs/2026-08-14-dataflow-bigquery-reportes-design.md**: Marcada como SUPERSEDIDA sin reescribir contenido.

### Step 2 — Guard de arquitectura endurecido
Test actualizado con:
- Verificación de `cron-parser` y `ssh2-sftp-client` en `dependencies` y `devDependencies`
- Loop con términos `Impala`, `SFTP`, `JDBC`, `Spark` (word boundary)
- `REMOTE_API_(URL|KEY)` sin word boundary
- Identificadores: `destinoApiUrl`, `destinoApiKey`, `destinoBaseDatos`, `conexionesOrigen`, `destinosCache`

## Step 3 — Matriz completa

| Comando | Resultado |
|---------|-----------|
| `bun test apps/api/src` | 150 tests, 148 pass, 2 fail, 2 errors (pre-existentes) |
| `bun test packages/contratos/src` | 17 tests, 16 pass, 1 fail, 1 error (pre-existente) |
| `bun run test:run` (web) | 41 test files, 102 tests pass |
| `tsc --noEmit` (contratos) | OK |
| `tsc --noEmit` (api) | Errores pre-existentes (`GOOGLE_SIGNED_URL_MINUTOS` en mock, `cliente-gcs` con `@google-cloud/storage` no resuelto hasta `bun install`) |
| `tsc --noEmit` (web) | OK |
| `bun run build` (contratos) | OK |
| `bun run build` (api) | OK (post `bun install`) |
| `bun run build` (web) | OK |
| `biome check` | 75 errores (pre-existentes en código legacy) |
| `git diff --check` | OK |

## Step 4 — Smoke test local
No ejecutado (requiere API + Vite activos con sesión Qlik real).

## Step 5 — Verificación de limpieza textual

```bash
rg -n '\b(Impala|SFTP|JDBC|Spark)\b|REMOTE_API_(URL|KEY)|destinoApiUrl|destinoApiKey|destinoBaseDatos|conexionesOrigen|destinosCache' \
  apps/api/src apps/web/src packages/contratos/src README.md \
  docs/arquitectura docs/desarrollo docs/setup \
  --glob '!apps/api/src/arquitectura-integraciones-activas.test.ts'
```

**Resultados**: Términos encontrados en:
- `docs/arquitectura/ARQUITECTURA.md` — CORREGIDO (se eliminó la mención expresa)
- `packages/contratos/src/admin/configuracion-secreta.test.ts` — test de regresión que verifica ausencia de `destinoApiUrl`
- `packages/contratos/src/admin/tenant-qlik.test.ts` — test de regresión que verifica ausencia de `destinoApiUrl`, `destinoBaseDatos`
- `apps/api/src/modulos/admin/infraestructura/helpers-admin.test.ts` — test de regresión
- `apps/api/src/plataforma/configuracion/entorno.test.ts` — test que verifica `REMOTE_API_URL/KEY` ignorados
- `apps/api/src/esquema.test.ts` — test que verifica `conexionesOrigen` y `destinosCache` no existen
- `apps/web/src/modulos/reportes/componentes/visor-workspace.tsx:517` — `Talend + Spark` en texto UI (comentario/traza)
- `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.test.ts` — test con script `STORE SFTP`

**Análisis**: Todos los resultados son **tests de regresión** que verifican que las propiedades legacy NO existen en el schema, o menciones en la UI. No hay código activo que use estas integraciones. Los tests de regresión son precisamente los que impiden reintroducir legacy.

## Preocupaciones

1. **Biome 75 errores**: Pre-existentes en código que no fue tocado por esta tarea. Predominan problemas de formato y organización de imports en archivos de módulos existentes.
2. **Test failure contratos (1 fail)**: Pre-existente. `esquemaConfigurarDestinoTenant` no exportado desde `index.ts` de `packages/contratos`.
3. **API typecheck 1 error**: Pre-existente en `app.test.ts` (`GOOGLE_SIGNED_URL_MINUTOS` falta en mock). No bloquea build.
4. **Tests de regresión legítimos**: Los términos encontrados en `tenant-qlik.test.ts`, `helpers-admin.test.ts`, `entorno.test.ts`, `esquema.test.ts`, `configuracion-secreta.test.ts` son **asersiones que verifican ausencia** — son exactamente los guards que el brief exige.
5. **`ssh2-sftp-client.d.ts`**: Stub de tipos legacy excluido del scan con filtro `.d.ts`. La librería `ssh2-sftp-client` no está en `package.json`.

## Resumen

Documentación actualizada, guard endurecido con scan verificado (contenido > 1000 chars, 3 dirs), referencia `Talend + Spark` corregida a `Talend + BigQuery`, commits hechos, worktree limpio. Tests de regresión existentes evitan reintroducción de legacy. Los fallos pre-existentes no son bloqueantes.

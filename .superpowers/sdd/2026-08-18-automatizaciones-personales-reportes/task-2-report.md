# Task 2 — Reporte de implementación

## RED

- Se ejecutó inicialmente:
  `bun test apps/api/src/esquema.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.test.ts`
- Falló como se esperaba porque aún no existían `automatizacionesPersonalesQlik` ni el repositorio de workers; el esquema todavía exportaba `configuracionesAutomatizacion`.

## Migración revisada

`apps/api/drizzle/0004_separar_reportes_workers.sql` fue generado con Drizzle tras resolver explícitamente:

- `configuraciones_automatizacion` → `reportes` como rename de tabla.
- `configuracion_id` → `reporte_id` como rename de columna.
- creación de `automatizaciones_personales_qlik` con `UNIQUE(usuario_id, tenant_qlik_id)`.
- eliminación únicamente de las dos columnas Automate propiedad del reporte.
- columnas nullable `ejecutado_por_usuario_id` y `automatizacion_personal_id` en ejecuciones.
- FKs nuevas y recreación de índices/constraints necesarios.

Revisión manual: la migración no contiene `DROP TABLE`, no inserta/copía reportes, no elimina filas de `ejecuciones_reportes`, conserva `automatizacion_id_qlik` histórico y no crea workers a partir de Automates existentes. `meta/0004_snapshot.json` y `_journal.json` corresponden a la migración 0004.

## Archivos cambiados

- `apps/api/src/plataforma/persistencia/esquema.ts`
- `apps/api/drizzle/0004_separar_reportes_workers.sql`
- `apps/api/drizzle/meta/0004_snapshot.json`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/esquema.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.ts`
- `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
- `apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.ts`
- `apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.test.ts`

## GREEN y verificación

Comando fresco:

```text
bun test ...esquema.test.ts ...repositorio-reportes-postgres.test.ts ...repositorio-automatizaciones-personales-postgres.test.ts
26 pass, 0 fail
bun run --cwd apps/api typecheck
exit 0
bunx biome check [archivos modificados]
Checked 8 files in 23ms. No fixes applied.
git diff --check
exit 0
```

`bun run test:backend` alcanzó 176 tests pasados, pero la ejecución paralela produjo errores de conexión asíncronos en tests existentes y un fallo dependiente de ese entorno; el test aislado de `ejecutar-reporte` pasó 3/3.

## db:check

Antes de tocar cualquier base se inspeccionó `apps/api/src/plataforma/bootstrap/check.ts`: abre `DATABASE_URL`, ejecuta consultas de disponibilidad y cuenta tablas/datos; no aplica migraciones. No había `DATABASE_URL` en el entorno y no se usó la base persistente del usuario. La ejecución controlada de `bun run db:check` terminó con `Falta la variable DATABASE_URL` (exit 1). No se ejecutó una base temporal porque no había un servidor PostgreSQL aislado disponible.

## Self-review

- Las filas históricas mantienen ID, ejecución y snapshot Qlik.
- `ejecutado_por_usuario_id` y `automatizacion_personal_id` son nullable en el esquema y migración.
- No se infiere el ejecutor histórico.
- Los métodos nuevos de reportes ya no escriben ni leen propiedad Automate.
- El repositorio de workers concentra la unicidad en PostgreSQL.

## Commit

Pendiente de commit al crear este reporte.

## Fix round 1/5

### Disposición de hallazgos

- **CRITICAL — cadena Drizzle:** corregido. Se eliminó la entrada huérfana `0005_lush_terrax` del journal y se alineó `0004_snapshot.json.prevId` con `0003_snapshot.json.id`.
- **IMPORTANT 1 — shims/coupling:** corregido. El puerto ya no expone `crearConfiguracion`, `obtenerPorAutomatizacion`, `obtenerConfiguracionPorId` ni `actualizarConfiguracion`, ni campos Automate de reportes. Los consumidores activos pasan a identificar reportes por UUID y alcance; edición/listado local ya no renombra ni resuelve Automate. La sincronización Qlik desde descargas queda explícitamente pendiente del resolver/worker de tareas posteriores, sin shim que lance o descarte asociaciones.
- **IMPORTANT 2 — alcance/contrato:** corregido. Los cinco métodos locales son obligatorios; `obtenerPorId(reporteId, tenantQlikId, organizacionId)` filtra las tres columnas. La prueba de repositorio cubre acceso correcto, acceso cross-tenant/org nulo y condiciones de `listar` con ambos alcances.
- **IMPORTANT 3 — unicidad worker:** corregido. La prueba de esquema verifica exactamente `[usuario_id, tenant_qlik_id]`; la prueba de repositorio rechaza el segundo par idéntico y permite tenant o usuario distintos.

### Evidencia RED/GREEN

- **RED:** la nueva prueba de cadena falló con `No file .../0005_lush_terrax.sql found`; después de reparar journal/snapshot, el loader pasó.
- **GREEN:** focal Task 2 y consumidores dirigidos: `48 pass, 0 fail`; rutas panel/descargas: `11 pass, 0 fail`.
- `bun run --cwd apps/api typecheck`: PASS.
- Check directo `readMigrationFiles({ migrationsFolder: "apps/api/drizzle" })`: `loaded 5 migrations`.
- `git diff --check`: PASS.
- No se tocó DB persistente ni se ejecutó BigQuery. `db:check` sigue condicionado a `DATABASE_URL` ausente.

### Cadena de migraciones

`0000_tan_zeigeist` → `0001_spooky_marvel_apes` → `0002_absent_thing` → `0003_even_spectrum` → `0004_separar_reportes_workers`.

IDs: `0003_snapshot.json.id = 1f4c7c47-7db8-4957-8709-bd773741477f`; `0004_snapshot.json.prevId = 1f4c7c47-7db8-4957-8709-bd773741477f`; `0004_snapshot.json.id = b50a1412-2afb-4695-aadf-2bcaa8c8176b`.

### Trabajo avanzado estrecho

Se migraron los consumidores actuales a UUID de reporte y alcance local. La ejecución aún recibe el ID Qlik resuelto por una etapa posterior, mientras la persistencia conserva el snapshot técnico histórico; no se adoptan Automates antiguos como workers ni se crea mapping legacy.

### Commit

Commit nuevo: `b41a8ce8c213b1df2f91522372b58c7422f4401d` (`fix: corregir migracion y contratos de reportes`). No se modificó `4b5bd1d`.

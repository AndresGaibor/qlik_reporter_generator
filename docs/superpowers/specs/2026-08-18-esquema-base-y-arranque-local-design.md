# Esquema Base y Arranque Local

**Estado:** aprobado para planificación

## Objetivo

Sustituir el historial de migraciones de desarrollo por un único esquema SQL idempotente y hacer reproducible el arranque local con PostgreSQL en Docker y API/Web con Bun.

## Alcance

- Reemplazar `apps/api/drizzle/` y su journal por `apps/api/sql/esquema-base.sql`.
- Aplicar el esquema base durante el arranque de la API, sin conservar un sistema de migraciones.
- Mantener `apps/api/src/plataforma/persistencia/esquema.ts` como contrato tipado y sincronizar sus restricciones e índices con el SQL.
- Separar la conexión de PostgreSQL del host (`localhost`) de la conexión interna de Compose (`postgres`).
- Reducir `.env.example`, `.env` y `.env.production` a variables consumidas por el runtime, Compose o scripts de bootstrap soportados.
- Reemplazar instrucciones obsoletas por una guía única de arranque, diagnóstico y reinicio de datos de desarrollo.

## No Alcance

- Migrar datos existentes o mantener compatibilidad con bases creadas con el historial anterior.
- Cambiar el modelo funcional de Qlik, OAuth o Google Cloud.
- Publicar, desplegar o modificar infraestructura externa.

## Decisiones

### ADR-001: Esquema SQL único e idempotente

`esquema-base.sql` contiene únicamente el estado final: tablas, claves foráneas, checks, índices y extensiones requeridas. Sus sentencias se deben poder ejecutar más de una vez sin fallar ni borrar datos.

La API aplicará este archivo antes de crear la aplicación. Se elimina `drizzle-kit migrate`, los snapshots y las migraciones numeradas. Una base anterior se debe reiniciar explícitamente, pues no hay producción ni necesidad de preservar datos.

### ADR-002: Dos rutas de conexión explícitas

`.env` para desarrollo local contiene una URL con host `localhost`. Compose construye la URL interna para la API con host `postgres`; no reutiliza la URL de host. Así `docker compose up -d postgres` seguido de `bun run dev` funciona sin editar variables.

### ADR-003: Configuración mínima documentada

Las variables obligatorias se limitan a los puertos y a las credenciales de PostgreSQL cuando se personalizan. Las credenciales de Qlik, bootstrap y cifrado permanecen opcionales y se documentan solo si el código todavía las consume. Variables sin consumidor se eliminan.

## Criterios de Aceptación

- [ ] Una base limpia queda lista tras arrancar la API, sin ejecutar `db:migrate`.
- [ ] El esquema base contiene las 19 tablas del estado actual, sus claves foráneas, checks e índices finales.
- [ ] `bun run dev` funciona después de `docker compose up -d postgres` usando el `.env` de ejemplo sin cambios de host.
- [ ] `docker compose up --build` funciona con el mismo conjunto de variables de usuario.
- [ ] Los ejemplos de entorno no incluyen variables no consumidas.
- [ ] La guía explica desarrollo, Docker completo, diagnóstico y reseteo destructivo de datos locales.
- [ ] Typecheck, lint, pruebas relevantes y build verifican los cambios.

## Riesgos y Recuperación

- El cambio elimina el historial: cualquier base local anterior debe reiniciarse con `docker compose down -v` antes de usar el nuevo esquema.
- Los secretos de `.env` no se sustituyen ni se muestran durante el trabajo. Solo se eliminarán claves que se prueben sin consumidor.
- Si la inicialización falla, la guía debe dirigir a revisar la salud del contenedor PostgreSQL y los logs de la API antes de reiniciar los volúmenes.

# Production Readiness Implementation Plan

**Goal:** Dejar el repositorio listo para producción con un despliegue Docker reproducible, seguro, observable y verificable.

**Architecture:** Compose coordina `postgres -> migrate -> api -> web`; solo web se publica al host. La API separa liveness/readiness, exige secretos productivos y conserva límites de módulos existentes.

**Global Constraints:** No tocar archivos concretos de la API key; no imprimir secretos; no debilitar guardas; no usar `--force`; no publicar API/PostgreSQL en producción; migraciones forward-only.

## Workstreams

1. Quality gate: lint, tests backend/frontend, warnings React y artefactos temporales.
2. Configuración: `.env` templates, URLs, OAuth y Vite build-time.
3. Docker: Compose, migraciones one-shot, healthchecks, red interna y hardening.
4. Runtime: liveness/readiness y secretos AES/PostgreSQL.
5. Operaciones: Nginx, backup/restore, rollback y observabilidad.
6. Documentación/CI: enlaces, agentes, release-check, secret scan y smoke aislado.
7. Verificación final: suites, auditoría, builds, Compose, smoke y estado Git.

## Ledger

| Área | Evidencia inicial | Decisión |
|---|---|---|
| Calidad | 37 lint, 4 backend y 3 frontend fallan | Corregir implementación según specs activas, no tests a ciegas |
| Secretos | `.env.production` existe; no se inspecciona | Mantenerlo fuera del trabajo y proteger futuros commits |
| Compose | API/Postgres publicados y password fallback | Separar producción de desarrollo con override explícito |
| Migraciones | Drizzle disponible, sin servicio one-shot | Crear servicio `migrate` dependiente de Postgres healthy |
| Salud | `/api/salud` único | Conservar compatibilidad y añadir live/ready |

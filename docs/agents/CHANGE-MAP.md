# Mapa de cambios

| Quiero cambiar... | Empieza por | Revisa también |
|---|---|---|
| Login/sesión | `apps/web/src/modulos/autenticacion` | `packages/contratos/src/autenticacion`, `apps/api/src/modulos/autenticacion-qlik` |
| Configuración/tenants | `apps/web/src/modulos/admin` | `packages/contratos/src/admin`, `apps/api/src/modulos/admin` |
| Reportes | `apps/web/src/modulos/reportes` | `packages/contratos/src/reportes`, `apps/api/src/modulos/reportes` |
| Descargas | `apps/web/src/modulos/descargas` | `packages/contratos/src/descargas`, `apps/api/src/modulos/descargas` |
| Dataflows | `apps/web/src/modulos/flujos` | `packages/contratos/src/flujos`, `apps/api/src/modulos/flujos` |
| Proxy/API Qlik | `apps/api/src/modulos/qlik` | `docs/arquitectura/rutas-qlik.md`, consumidores del módulo |
| BigQuery/configuración | `apps/api/src/modulos/google-cloud` | `apps/api/src/modulos/admin`, `apps/api/src/modulos/reportes` |
| SQL generado | `apps/api/src/modulos/reportes/aplicacion/compilador-vnext` | parser → semántica → IR → emisor + corpus |
| Nueva función Qlik | `compilador-vnext/registro-funciones.ts` | `expresiones-qlik/dispatcher.ts`, emisor correspondiente, fixtures/tests |
| Esquema Postgres | `apps/api/src/plataforma/persistencia/esquema.ts` | repositorios afectados + `apps/api/drizzle` |
| Navegación global web | `apps/web/src/app` | `src/modulos/*/rutas.tsx` |
| Componente UI común | `apps/web/src/compartido` | todos sus consumidores antes de romper props |

Para cambios de payload, empieza por contratos; para cambios puramente visuales, evita tocar backend salvo necesidad real.

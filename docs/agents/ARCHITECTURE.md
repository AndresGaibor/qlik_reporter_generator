# Arquitectura para agentes

## Flujo principal

`apps/web` → HTTP → `apps/api/src/app.ts` → módulo HTTP → aplicación → puerto → infraestructura → Qlik/BigQuery/GCS/Postgres.

Los tipos compartidos cruzan la frontera mediante `packages/contratos`. El frontend no importa implementación backend y los casos de uso backend no deberían depender de Hono o adaptadores concretos.

## Composition root

`apps/api/src/app.ts` ensambla repositorios, servicios, clientes Qlik/Google Cloud, middlewares y rutas. Si una dependencia concreta cambia, empieza aquí para entender cómo se inyecta.

## Persistencia

`apps/api/src/plataforma/persistencia/esquema.ts` define el esquema Drizzle/Postgres. Los repositorios concretos viven normalmente bajo `modulos/*/infraestructura`.

## Integraciones

- Qlik Cloud: `modulos/qlik` + consumidores en reportes/flujos/automatizaciones/admin.
- BigQuery: `modulos/google-cloud` + compilador/reportes.
- GCS: `modulos/descargas` y destino de exportación de reportes.

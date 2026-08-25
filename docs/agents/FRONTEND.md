# Frontend

`apps/web/src/main.tsx` arranca la aplicación. `app/` define router, navegación, providers y layout. `compartido/` contiene cliente API, UI, hooks y utilidades sin dependencia hacia features.

## Módulos

`admin`, `autenticacion`, `descargas`, `flujos`, `inicio`, `reportes`, `setup`.

Dentro de una feature revisa normalmente en este orden: `rutas.tsx` → página → hooks/componentes → `api.ts`. Si cambia el contrato HTTP, busca primero el schema/tipo correspondiente en `packages/contratos`.

Evita trasladar reglas de negocio al frontend: presentación, estado de interacción y adaptación de respuesta sí; permisos/invariantes persistentes deben mantenerse en backend.

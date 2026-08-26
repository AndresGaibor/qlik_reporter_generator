# Backend

`apps/api/src/app.ts` es el composition root. Las entradas Bun/Node/Worker viven en `entradas/`.

## Capas esperadas

- `dominio`: reglas/tipos puros.
- `aplicacion`: casos de uso, servicios, puertos.
- `http`: Hono, validación/adaptación de solicitudes.
- `infraestructura`: Postgres, Qlik, Google Cloud y adaptadores concretos.

## Módulos

`admin`, `autenticacion-qlik`, `automatizaciones`, `descargas`, `flujos`, `google-cloud`, `qlik`, `reportes`, `setup`.

Antes de mover lógica entre módulos revisa imports cruzados en `NAVIGATION.json`. Prefiere `publico.ts`/puertos sobre imports profundos cuando exista esa frontera.

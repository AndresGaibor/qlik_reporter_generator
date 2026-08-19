# Informe de correcciones — Dataflow como reporte

## RED

- **I-1:** la prueba de creación con `dataflowBaseIdQlik` inexistente y otro Dataflow con el mismo nombre devolvía `201` y podía copiar; esperado `404 DATAFLOW_BASE_NO_DISPONIBLE_EN_TENANT` sin copia.
- **I-2:** las pruebas de sincronización usaban el método por `runIdQlik`; el caso de dos ejecuciones con el mismo run no garantizaba actualizar la ejecución seleccionada.
- **I-3:** las pruebas del detalle no encontraban las consultas bajo claves que incluyeran el tenant activo.
- **M-1:** el GET de plantilla configurada ausente devolvía `200`; esperado `404 DATAFLOW_BASE_NO_DISPONIBLE_EN_TENANT`.

## Correcciones

- Las rutas compartidas `/api/flujos` y `/api/reportes` resuelven la plantilla exclusivamente por `dataflowBaseIdQlik` tanto en GET como en POST.
- La sincronización conserva la búsqueda histórica Qlik por Automate/run, pero persiste estados terminales mediante `marcarEstadoEjecucion(id, ...)`, acotado al ID de ejecución.
- Las claves de React Query del detalle incluyen `tenantActivo?.id`; catálogo y plantilla ya estaban separadas por tenant.
- No se modificó la migración 0006 ni se realizaron llamadas externas.

## Validación GREEN

Comando agrupado ejecutado:

```text
bun test [rutas de flujos, rutas de reportes, sincronización y repositorio]
bun run --cwd apps/web test:run src/modulos/reportes/pagina-detalle-reporte.test.tsx
bun run typecheck
a biome check sobre archivos modificados
git diff --check
```

Resultados:

- Backend focalizado: **20 pass, 0 fail**.
- Página web: **1 archivo, 1 test pass**.
- Typecheck de contratos, API y web: **pass**.
- Biome sobre 10 archivos modificados: **pass**.
- `git diff --check`: **pass**.

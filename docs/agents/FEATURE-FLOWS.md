# Flujos funcionales end-to-end

Usa este mapa cuando la petición describe comportamiento y no un archivo.

## Autenticación Qlik

`apps/web/src/modulos/autenticacion` → `packages/contratos/src/autenticacion` → `apps/api/src/modulos/autenticacion-qlik/http/rutas.ts` → `servicio-autenticacion.ts` → repositorios/cliente OAuth.

## Configuración de tenant

`apps/web/src/modulos/admin` → `packages/contratos/src/admin` → `apps/api/src/modulos/admin/http` → casos de uso/admin → repositorios Postgres y configuración OAuth/BigQuery.

## Crear y listar reportes

`apps/web/src/modulos/reportes` → `packages/contratos/src/reportes` → `rutas-reportes-dataflow.ts` → Qlik/Dataflows + repositorio de ejecuciones.

## Preflight y compilación

`pagina-detalle-reporte.tsx` → API reportes → `preflight-dataflow.ts` → `compilador-vnext/index.ts` → parser → semántica/IR → emisor BigQuery → estimador BigQuery.

## Ejecutar reporte

Frontend reportes → `rutas-reportes-dataflow.ts` → `ejecutar-reporte.ts` → compilador/preflight → automatización personal → Qlik Automate/Talend → GCS.

## Descargas

`apps/web/src/modulos/descargas` → contratos descargas → `modulos/descargas/http` → `servicio-descargas.ts` → `cliente-gcs.ts` + historial de ejecuciones.

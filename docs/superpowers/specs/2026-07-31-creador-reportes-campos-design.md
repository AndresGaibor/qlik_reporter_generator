# Diseño: creador de reportes orientado a campos

## Objetivo

Reducir la carga cognitiva al crear un reporte BigQuery y evitar usar una tabla horizontal de decenas de columnas como selector principal.

## Estructura

1. Nombre del reporte.
2. Tabla de origen y periodo.
3. Selector de campos en panel lateral.
4. Vista previa limitada a los campos seleccionados.
5. Resumen de validación, costo y acción final.

## Selección de campos

- Lista vertical buscable con checkbox, nombre y tipo.
- Filtros: Todos, Seleccionados, Fechas, Texto y Números.
- Acciones explícitas Seleccionar visibles y Deseleccionar visibles.
- La vista previa deja de ser el mecanismo principal de selección.
- Al cambiar de tabla se seleccionan inicialmente hasta 12 campos, priorizando fechas, identificadores y métricas principales.
## Periodo

- El usuario elige explícitamente el campo de fecha cuando existen columnas compatibles.
- El periodo se marca como obligatorio.
- Se ofrecen accesos rápidos: últimos 7, 30 y 90 días.
- El botón final explica qué requisito falta.

## Vista previa

- Solo muestra hasta ocho campos seleccionados simultáneamente.
- Usa bordes suaves y tokens del sistema; no utiliza `slate-*`.
- Los valores nulos se representan como `—`.
- Los campos restantes se indican con un contador.

## Estimación

- La consulta de estimación usa un debounce de 450 ms.
- El costo se muestra con máximo cuatro decimales y los bytes en unidades humanas.
- El bloque es informativo y no compite visualmente con Crear reporte.
- Los errores de estimación no bloquean la edición y ofrecen reintento.
## Acción final

- La barra final permanece visible al llegar al área inferior y resume tabla, campos y periodo.
- Crear reporte se habilita únicamente con tabla, campo de fecha, rango completo y al menos un campo.
- Cuando está deshabilitado, se muestra el requisito pendiente en texto.
- El nombre sugerido se carga como valor editable y no incluye el nombre del usuario.

## Arquitectura

`pagina-nueva-automatizacion.tsx` queda como orquestador. Se extraen utilidades puras, selector de periodo, selector de campos, vista previa y resumen final a componentes enfocados y probables.

## Compatibilidad

Se mantienen el endpoint de estimación, la creación desde plantilla, la ruta actual y el modo integrado utilizado por el detalle del reporte.
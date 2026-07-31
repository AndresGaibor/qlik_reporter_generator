# Lista operativa de reportes

## Objetivo

Convertir la pantalla de reportes en una lista compacta y operativa que permita identificar rápidamente qué reporte usar, su estado real, cuándo se ejecutó por última vez y cuál es la siguiente acción disponible.

## Alcance aprobado

- Mantener la cabecera, navegación y lenguaje visual actuales.
- Compactar los filtros en una sola franja.
- Sustituir las tarjetas altas por filas adaptables.
- Mostrar estados concretos en lugar de "Funcionando".
- Dar prioridad a ejecutar y consultar el detalle.
- Mover acciones técnicas a un menú secundario.
- Mantener la paginación existente.

## Jerarquía de cada fila

Cada reporte mostrará, en este orden:

1. Nombre del reporte.
2. Espacio y propietario como contexto secundario.
3. Resultado de la última ejecución, fecha y duración.
4. Estado operativo actual.
5. Acción principal para ejecutar.
6. Acción secundaria para ver el detalle.
7. Menú de acciones técnicas.

## Estados operativos

La etiqueta principal seguirá estas reglas:

- `En ejecución`: existe una ejecución activa.
- `Inactivo`: la automatización está deshabilitada.
- `Requiere atención`: la última ejecución terminó con error.
- `Disponible`: está activa y puede ejecutarse.

El resultado de la última ejecución se mostrará por separado:

- `Completada · 30 jul 2026, 16:13 · 12 s`.
- `Fallida · 30 jul 2026, 16:13 · 8 s`.
- `En ejecución · inició 30 jul 2026, 16:13`.
- `Aún no se ha ejecutado` cuando Qlik no entregue historial.

## Contrato de datos

El resumen de automatización incorporará tres campos opcionales:

- `ultimaEjecucionEstado`.
- `ultimaEjecucionInicio`.
- `ultimaEjecucionFin`.

El API los obtendrá de `lastRun` o `lastExecution`. Cuando Qlik solo entregue `lastRunAt` y `lastRunStatus`, se usarán como respaldo. No se realizarán consultas adicionales por cada fila.

## Filtros

La cabecera conservará el botón `Crear reporte`. Debajo habrá una franja compacta con:

- Selector de espacio.
- Campo de búsqueda con icono y botón de limpieza.
- Texto con la cantidad de resultados cuando corresponda.

La búsqueda se aplicará automáticamente con una espera breve de 350 ms. También se podrá confirmar con Enter. Se elimina el botón verde `Buscar`, porque compite visualmente con `Crear reporte` y `Ejecutar reporte`.

## Acciones

- `Ejecutar reporte`: botón principal verde.
- `Ver detalle`: botón secundario.
- `Más acciones`: menú con `Abrir en Qlik Cloud` cuando exista host.

Las acciones técnicas no aparecerán como botones permanentes. En modo usuario final, la interfaz seguirá siendo comprensible aunque Qlik Cloud no esté disponible.

## Diseño adaptable

En escritorio se usará una cabecera de columnas y filas compactas dentro de un único contenedor. En móvil cada fila se convertirá en un bloque vertical con acciones al final. Los nombres largos se truncarán visualmente, pero conservarán el texto completo mediante `title`.

## Estados vacíos y paginación

Los textos usarán siempre `reportes`, no `automatizaciones`. La paginación mantendrá su comportamiento, pero reducirá relleno y contraste para no competir con la lista.

## Accesibilidad

- Los botones conservarán nombres visibles o `aria-label` descriptivos.
- El menú técnico usará `details` y `summary` para funcionar sin estado global.
- Los estados no dependerán únicamente del color.
- El foco seguirá siendo visible con los estilos existentes.

## Pruebas

Se cubrirán los siguientes comportamientos:

- El mapeador del API expone última ejecución y sus fechas.
- Los estados principales distinguen disponible, ejecución, error e inactivo.
- La fila muestra resultado, fecha y duración de la última ejecución.
- Las acciones técnicas permanecen ocultas hasta abrir el menú.
- Los filtros ya no muestran un botón de búsqueda permanente.
- La paginación usa el término `reportes`.

## Criterios de aceptación

- En una pantalla de escritorio de 1440 px deben verse al menos cinco reportes sin que cada uno parezca una tarjeta independiente de gran altura.
- `Funcionando` no debe aparecer como estado.
- La última modificación no debe ser el dato operativo principal.
- Solo `Ejecutar reporte` utilizará el botón verde dentro de cada fila.
- La pantalla debe aprobar pruebas, TypeScript, build y Biome.

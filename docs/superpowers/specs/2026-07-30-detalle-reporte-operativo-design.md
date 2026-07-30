# Diseño: detalle operativo del reporte

Fecha: 30 de julio de 2026
Estado: aprobado
Ruta objetivo: `/Users/andresgaibor/code/javascript/qlik_reportes_creator`

## Objetivo

Rediseñar la pantalla de detalle para que el usuario entienda primero el estado operativo del reporte, pueda ejecutarlo sin buscar la acción principal y consulte rápidamente el resultado de las ejecuciones recientes.

La configuración seguirá disponible, pero dejará de dominar la pantalla. La interfaz usará siempre el término **reporte** para el usuario final y reservará **automatización de Qlik** para información técnica o enlaces externos.

## Problemas actuales

- El formulario de configuración ocupa la zona más importante de la pantalla.
- Las acciones están separadas del estado y de la última ejecución.
- Los metadatos secundarios usan demasiado espacio.
- El historial muestra estados técnicos en inglés y UUID completos.
- No existe una lectura rápida de qué ocurrió en la ejecución más reciente.
- La pantalla mezcla configuración, operación y administración sin jerarquía clara.

## Principio de diseño

La pantalla responderá, en este orden, a cuatro preguntas:

1. ¿Este reporte está disponible y qué ocurrió la última vez?
2. ¿Cómo lo ejecuto ahora?
3. ¿Qué datos y periodo tiene configurados?
4. ¿Qué pasó en las ejecuciones anteriores?

## Estructura de la pantalla

### 1. Navegación y cabecera operativa

El enlace de regreso será compacto y quedará integrado sobre la cabecera. La cabecera contendrá:

- Nombre del reporte como título principal.
- Espacio de Qlik como contexto secundario.
- Estado operativo visible: Disponible, Ejecutándose, Fallido o Inactivo.
- Acción primaria `Ejecutar reporte`.
- Acción de detención únicamente durante una ejecución activa.
- Menú de acciones secundarias: abrir en Qlik Cloud, clonar y ver configuración técnica cuando el rol lo permita.

La acción primaria permanecerá visible en la parte superior para que el usuario no tenga que desplazarse antes de ejecutar.

### 2. Resumen de la última ejecución

Debajo de la cabecera aparecerá un resumen compacto con:

- Resultado traducido al español.
- Inicio de la ejecución.
- Hora de finalización o indicación de que sigue en curso.
- Duración calculada cuando existan ambas fechas.
- Propietario del reporte.

Cuando no existan ejecuciones se mostrará un mensaje de primera ejecución, no una tabla vacía. Si la última ejecución falla, el resumen utilizará tratamiento semántico de error y orientará al usuario a revisar el historial.

### 3. Configuración resumida y edición progresiva

La configuración se presentará inicialmente como un resumen legible:

`Tabla clientes · 8 campos · 1 jun.–30 jun. 2026`

También mostrará una vista breve de los campos elegidos, limitada para evitar ruido. Un botón `Editar configuración` expandirá el formulario existente dentro de la misma sección.

El formulario conservará la selección de tabla, campos y periodo, pero en modo integrado tendrá estas reglas:

- Abrir y cerrar sin alterar la configuración guardada.
- Botones explícitos `Cancelar` y `Guardar cambios`.
- Indicador de cambios pendientes.
- El formulario se cerrará después de guardar correctamente.
- Un error de guardado conservará los cambios locales y mostrará la notificación actual.

### 4. Historial de ejecuciones

El historial será la sección principal de consulta. La tabla mostrará:

- Estado traducido y con semántica visual consistente.
- Identificador abreviado, manteniendo el valor completo accesible mediante título o acción de copia.
- Inicio.
- Fin.
- Duración.

La ejecución más reciente será distinguible sin usar una decoración excesiva. Los estados contemplados serán al menos: Finalizada, En curso, En cola, Fallida, Cancelada y Desconocida.

En pantallas pequeñas cada ejecución se convertirá en una fila adaptable o bloque legible, evitando desplazamiento horizontal como única forma de consulta.

## Componentes y límites

### `PaginaDetalleAutomatizacion`

Continuará coordinando consultas y mutaciones. Preparará los datos derivados de estado, última ejecución y configuración, pero no contendrá detalles extensos de presentación.

### `TarjetaDetalleAutomatizacion`

Se transformará en cabecera operativa y resumen de última ejecución. Será responsable de mostrar estado, metadatos prioritarios y acciones.

### Nuevo resumen de configuración

Se extraerá un componente enfocado en presentar la configuración guardada y controlar la expansión del editor. El componente no modificará directamente el workspace; delegará el guardado a la página.

### `PaginaNuevaAutomatizacion`

Mantendrá su uso para creación. En modo integrado aceptará controles para cancelar, detectar cambios y ajustar textos sin duplicar el formulario.

### `ListaEjecuciones`

Centralizará traducción de estados, duración, abreviación del ID, estado vacío y adaptación móvil. No realizará nuevas consultas.

## Flujo de datos

1. La página carga detalle, sesión y workspace mediante React Query.
2. El detalle determina el estado operativo y la última ejecución.
3. El workspace se convierte a `ConfiguracionReporte` mediante las funciones existentes.
4. El usuario ejecuta, detiene, clona o edita desde componentes presentacionales.
5. Las mutaciones invalidan únicamente las claves relacionadas.
6. Durante una ejecución activa se conserva el refresco cada tres segundos.
7. Al guardar configuración se actualiza el workspace y se refrescan detalle y workspace.

No se modificarán los contratos del backend salvo que una prueba demuestre que falta un dato imprescindible. La duración se calculará en el frontend con las marcas temporales existentes.

## Tratamiento visual

- Un solo botón verde principal por contexto.
- Menos tarjetas independientes y menos fondos grises anidados.
- Bordes usados como separación, no como decoración dominante.
- Tipografía monoespaciada solo para identificadores técnicos.
- Estados en español y con color semántico, nunca dependientes únicamente del color.
- Densidad compacta en escritorio y controles con área táctil suficiente en móvil.

## Errores y estados transitorios

- La ejecución pendiente deshabilitará acciones incompatibles.
- La detención solo aparecerá si existe una ejecución activa identificable.
- Los errores de consultas conservarán el componente `EstadoError` y su reintento.
- La ausencia de workspace no bloqueará la operación del reporte; ocultará la edición y mostrará una explicación si es necesario.
- Los datos faltantes se mostrarán como `Sin información`, no como valores técnicos vacíos.

## Pruebas y validación

Se añadirán o actualizarán pruebas para comprobar:

- Traducción de todos los estados conocidos.
- Cálculo y presentación de duración.
- Estado vacío sin ejecuciones.
- Prioridad de la acción `Ejecutar reporte`.
- Aparición de `Detener` durante una ejecución activa.
- Resumen correcto de tabla, número de campos y periodo.
- Apertura, cancelación y guardado del editor integrado.
- Restricción de acciones técnicas según rol y vista de usuario final.

La validación final incluirá `typecheck`, pruebas del frontend, build y revisión visual en la aplicación ejecutándose.

## Fuera de alcance

- Rediseñar por completo el listado de reportes.
- Cambiar la API de Qlik o el modelo persistido.
- Crear programación recurrente de reportes.
- Añadir filtros o paginación del historial que no sean necesarios para el volumen actual.
- Reestructurar módulos no relacionados con la pantalla de detalle.

## Criterios de aceptación

- La acción de ejecución y el estado se comprenden sin desplazarse.
- El usuario puede identificar el resultado de la última ejecución en pocos segundos.
- La configuración ocupa menos espacio cuando no se está editando.
- El historial no expone estados en inglés como texto principal.
- La pantalla evita UUID completos como elemento visual dominante.
- Las funciones actuales de ejecutar, detener, clonar, abrir en Qlik y guardar configuración continúan funcionando.
- La interfaz es usable en escritorio y móvil sin pérdida de información esencial.

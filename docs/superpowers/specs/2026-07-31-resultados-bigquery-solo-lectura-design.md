# Resultados BigQuery de solo lectura — Diseño

## Objetivo

Convertir `/tablas` en un catálogo claro de resultados BigQuery de solo lectura. La pantalla debe permitir descubrir tablas, revisar su estructura y una muestra de datos, y usar una tabla como origen de un nuevo reporte.

## Alcance

La pantalla mostrará únicamente datos reales obtenidos desde la conexión BigQuery configurada. No permitirá crear, editar ni eliminar tablas. Tampoco mostrará solicitudes de aprobación, permisos, auditorías o historiales simulados.

## Modelo mental

La experiencia responde a tres preguntas:

1. ¿Qué tablas están disponibles?
2. ¿Qué contiene la tabla seleccionada?
3. ¿Cómo creo un reporte a partir de ella?

## Estructura visual

### Cabecera

- Título: `Resultados BigQuery`.
- Descripción breve orientada a consulta, no a administración.
- Contexto del dataset activo y número de tablas cuando estén disponibles.
- Sin botón global para crear tablas o solicitar reportes.

### Catálogo lateral

- Buscador local con actualización inmediata.
- Lista compacta de tablas y vistas.
- Nombre del recurso como dato principal.
- Tipo y namespace como metadatos secundarios cuando existan.
- Estado seleccionado visible mediante fondo y borde suaves.
- Sin selector genérico de conexiones; se usará la conexión BigQuery predeterminada.

### Detalle del recurso

- Nombre completo `dataset.tabla`.
- Resumen compacto con número de columnas, registros y última actualización cuando el API los entregue.
- Acción principal `Crear reporte con esta tabla`.
- La acción navegará a `/reportes/nueva` con `tablaId`.

### Pestañas

- `Campos`: nombre, tipo de dato y posición.
- `Vista previa`: primeras filas devueltas por el API.
- No se mostrará DDL hasta que exista una necesidad de usuario confirmada.

## Estados

- BigQuery no configurado: mensaje claro y enlace a `/configuracion` para administradores.
- Sin conexión disponible: estado explicativo sin controles rotos.
- Catálogo vacío: indicar que el dataset no contiene tablas visibles.
- Sin resultados de búsqueda: permitir limpiar el filtro.
- Sin selección: instrucción breve para elegir una tabla.
- Error de catálogo, detalle o vista previa: mensaje localizado y opción de reintentar.
- Carga: skeletons o mensajes dentro de cada zona, sin bloquear toda la página cuando solo carga el detalle.

## Arquitectura de componentes

`PaginaTablasDestino` quedará como orquestador de consultas, selección y navegación. La presentación se dividirá en:

- `CabeceraResultadosBigQuery`: título y contexto.
- `CatalogoResultadosBigQuery`: búsqueda y selección.
- `DetalleResultadoBigQuery`: resumen y acción principal.
- `TablaCamposBigQuery`: esquema del recurso.
- `VistaPreviaBigQuery`: muestra tabular y estados.
- `EstadoResultadosBigQuery`: estados vacíos y de configuración.

Cada componente consumirá datos por props y no realizará consultas propias, salvo que una frontera existente del proyecto lo haga claramente más simple.

## Datos y flujo

1. Obtener conexiones disponibles.
2. Elegir la conexión BigQuery predeterminada; si no existe, mostrar estado de configuración.
3. Obtener recursos de esa conexión.
4. Filtrar localmente por nombre.
5. Al seleccionar un recurso, solicitar detalle.
6. Solicitar vista previa únicamente al abrir su pestaña.
7. Al crear un reporte, navegar con el identificador real del recurso.

## Sistema visual

- Usar únicamente tokens del proyecto: `brand`, `ink`, `line`, `surface`, `app`, `hover` y `obj`.
- Eliminar clases `slate-*`, `emerald-*`, `sky-*` y estilos aislados que compitan con el sistema.
- Bordes suaves, una sola sombra por panel y densidad comparable a la lista de reportes.
- Reservar verde sólido para la acción principal.
- Usar tipografía monoespaciada solo para nombres técnicos y tipos de datos.

## Accesibilidad y responsive

- El catálogo será una lista seleccionable con estado accesible.
- Las pestañas tendrán semántica de tabs y navegación por teclado.
- Las tablas tendrán encabezados correctos y contenedores con desplazamiento horizontal.
- En móvil, catálogo y detalle se apilarán; seleccionar un recurso llevará visualmente al detalle sin ocultar el contexto.
- Los estados de carga y error usarán `aria-live` donde corresponda.

## Eliminaciones explícitas

- Modal `Solicitar Nueva Tabla`.
- Mutación simulada de aprobación.
- Botones `Editar reporte` y `Editar (Requiere Administrador)`.
- Mensajes de modo administrador simulados.
- Historial de cambios ficticio.
- Tarjetas de permisos ficticios.
- Asociación de tablas con automatizaciones por coincidencia parcial de nombre.
- Selector de conexiones genéricas.

## Pruebas

- Renderiza estado de BigQuery no configurado.
- Muestra y filtra recursos reales.
- Selecciona una tabla y presenta metadatos reales.
- Cambia entre Campos y Vista previa.
- No contiene textos ni controles simulados retirados.
- Construye el enlace de creación de reporte con el `tablaId` correcto.
- Mantiene comportamiento accesible y responsive mediante estructura semántica.

## Criterios de aceptación

- `/tablas` no contiene contenido ficticio ni acciones sin backend.
- La pantalla usa de forma consistente el sistema visual existente.
- El archivo principal deja de ser un componente monolítico y sus unidades tienen responsabilidades claras.
- El usuario puede encontrar una tabla, entender su estructura y comenzar un reporte sin ambigüedad.
- Pruebas, TypeScript, build y Biome terminan sin errores nuevos.

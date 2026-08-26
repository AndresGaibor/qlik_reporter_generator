# Manejo Global De Errores

## Objetivo

Ninguna excepción técnica, cuerpo HTTP inválido ni error de renderizado llegará
al usuario final. Cada fallo mostrará un mensaje en español que explique qué
puede hacer el usuario, sin revelar detalles internos.

## Alcance

- Respuestas HTTP vacías, no JSON, con formato inválido y errores de red.
- Errores devueltos por API, mutaciones y consultas de React Query.
- Excepciones inesperadas durante el renderizado de React.
- Recuperación mediante reintento o recarga desde una pantalla segura.

No se modifica el contrato de la API ni se reescriben las reglas de negocio de
los módulos.

## Arquitectura

### Normalizador De Errores

Se añadirá una función compartida que recibe `unknown` y devuelve un mensaje
seguro. Reconocerá `ErrorClienteApi` y su código/estado, además de errores
nativos de red. Las categorías serán:

| Categoría | Mensaje para usuario | Acción sugerida |
| --- | --- | --- |
| Sin conexión o servicio no disponible | "No pudimos conectar con el servidor. Intenta nuevamente en unos minutos." | Reintentar |
| Sesión expirada | "Tu sesión expiró. Inicia sesión nuevamente." | Iniciar sesión |
| Sin permisos | "No tienes permisos para realizar esta acción." | Contactar al administrador |
| Datos inválidos | Mensaje validado de la API o "Revisa los datos ingresados e intenta nuevamente." | Corregir y reintentar |
| Recurso no encontrado | "El recurso solicitado ya no está disponible." | Volver o actualizar |
| Fallo inesperado | "Ocurrió un problema inesperado. Intenta nuevamente." | Reintentar |

El mensaje original de un `Error` nativo nunca se presentará directamente. Los
mensajes de API continuarán mostrándose solo cuando provengan del contrato
controlado `ErrorClienteApi`.

### Cliente HTTP

`ClienteApi` seguirá leyendo la respuesta una sola vez. Sus rutas de fallo
generarán siempre `ErrorClienteApi` con un código estable: red, respuesta vacía,
respuesta inválida o respuesta HTTP. El módulo de autenticación usará el mismo
normalizador para que sus solicitudes especiales no hagan `response.json()` de
forma directa.

### React Query Y Vistas

Los `onError` que hoy muestran `error.message` utilizarán el normalizador. Se
configurarán cachés de `QueryClient` para que los errores no capturados por una
vista también generen una notificación segura. Los handlers específicos que
necesiten distinguir estado o código conservarán su lógica y normalizarán el
caso genérico.

### Límite De Errores

Un `ErrorBoundary` global envolverá proveedores, notificaciones y router. Ante
un error de renderizado mostrará una vista segura con las acciones "Reintentar"
y "Recargar página". El detalle técnico se conservará solamente mediante
`console.error` para diagnóstico local. El `errorComponent` del router se
mantiene para fallos propios de rutas y loaders.

## Flujo

1. Una solicitud falla o una vista lanza una excepción.
2. El cliente HTTP conserva código, estado y detalles confiables de API.
3. El normalizador convierte el error a una categoría y mensaje seguro.
4. La vista muestra una notificación, estado de error o pantalla de recuperación.
5. Los detalles técnicos no se muestran al usuario.

## Pruebas

- Cliente HTTP: error de red, respuesta vacía, JSON inválido y contrato HTTP de
  error.
- Autenticación: proxy que devuelve cuerpo vacío o inválido y mensaje seguro.
- Normalizador: cada categoría y una excepción desconocida.
- Límite global: un componente que falla muestra recuperación y permite
  reintentar.
- Integración: errores de consulta y mutación se notifican sin texto técnico.

## Criterios De Aceptación

- No quedan usos genéricos de `mostrarError(error.message)`.
- No quedan llamadas directas a `Response.json()` en solicitudes de frontend sin
  validar la respuesta.
- Un error de renderizado no deja una pantalla en blanco ni expone su mensaje.
- El usuario recibe mensajes en español con una acción clara.
- Todas las pruebas web, typecheck y lint relacionados pasan.

# Descargas privadas por usuario — Diseño

## Objetivo

Hacer que cada ejecución de reporte tenga un propietario persistido y que la API de descargas aplique autorización real por usuario, manteniendo una vista administrativa con acceso global dentro de la organización/tenant.

## Reglas funcionales

- Usuario final: solo ve y descarga ejecuciones creadas por su `usuarioId`.
- Administrador: puede ver sus ejecuciones, las de otros usuarios de la organización y el explorador GCS completo.
- Ejecuciones históricas sin propietario: solo visibles para administradores como histórico sin propietario.
- La autorización se valida en backend; la UI nunca es la barrera de seguridad.
- Las nuevas rutas GCS incluyen el UUID del propietario.
- Nombres/correos son solo presentación; nunca forman parte de la frontera de seguridad.

## Experiencia de usuario

La página Descargas debe usar iconos consistentes y separar claramente `Mis reportes` del espacio administrativo. El usuario final no debe ver el explorador GCS global. El administrador debe disponer de un resumen por usuario y conservar el explorador GCS.
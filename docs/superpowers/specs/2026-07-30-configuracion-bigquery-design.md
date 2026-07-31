# Configuración dedicada de BigQuery

## Objetivo

Restaurar BigQuery dentro de `/configuracion` sin volver a introducir el administrador genérico de conexiones eliminado previamente.

## Experiencia de usuario

La pantalla mostrará una tarjeta **BigQuery** después de la automatización base y antes de usuarios. La tarjeta permitirá:

- Pegar el JSON completo de una cuenta de servicio de Google Cloud.
- Extraer y mostrar automáticamente `project_id` y `client_email`.
- Indicar el dataset que utilizará la plataforma.
- Guardar una única conexión BigQuery predeterminada.
- Probar la conexión después de guardarla.
- Editar el dataset sin volver a pegar el JSON cuando ya existe un secreto cifrado.

El JSON nunca se vuelve a mostrar. La interfaz solo indicará que las credenciales están configuradas y mostrará el correo de servicio no sensible.

## Validación

El JSON debe ser válido y contener:

- `type: "service_account"`
- `project_id`
- `client_email`
- `private_key`

El dataset es obligatorio y acepta identificadores de BigQuery con letras, números y guiones bajos.
## Persistencia y seguridad

Se reutiliza `conexiones_destino` con `tipo = bigquery` y una conexión predeterminada por empresa. La configuración pública guarda proyecto, dataset y límites. El JSON se cifra con `servicioCifrado` y se almacena en `secreto_refs`.

Cuando se actualiza sin un JSON nuevo, el backend conserva el secreto existente. Las respuestas HTTP nunca incluyen `private_key`, el JSON original ni el valor cifrado.

## API

La API administrativa expondrá una lectura saneada y una escritura dedicada:

- `GET /api/admin/organizaciones/:id/tenants-qlik/:tenantQlikId/bigquery`
- `PUT /api/admin/organizaciones/:id/tenants-qlik/:tenantQlikId/bigquery`

La lectura devuelve estado, proyecto, dataset, correo de servicio y un booleano `credencialesConfiguradas`. La escritura acepta dataset, JSON opcional y límites opcionales.

La prueba de conexión seguirá usando `POST /api/destinos/conexiones/:id/probar`.

## Alcance

No se restauran PostgreSQL, SFTP, Impala ni la lista genérica de conexiones en Configuración. BigQuery aparece como una capacidad propia porque es la fuente de datos usada por reportes y resultados.

## Pruebas

- Contrato: valida JSON de cuenta de servicio y respuesta saneada.
- Backend: conserva el secreto cuando el JSON queda vacío y nunca lo devuelve.
- Frontend: muestra la tarjeta, extrae datos del JSON, exige dataset y permite guardar sin reenviar el secreto existente.
- Integración: TypeScript, Vitest, Bun tests, build y Biome.
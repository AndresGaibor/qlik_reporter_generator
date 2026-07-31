# Configuración de entorno único

## Objetivo

Eliminar el concepto visible de organizaciones y concentrar la administración del único entorno en `/configuracion`.

## Navegación

- Mantener `Configuración` como única entrada para administrar el entorno.
- Retirar `Organizaciones` del menú principal.
- Mantener `Superadmins` como administración global separada.
- Cambiar el acceso rápido de Inicio para que navegue a `/configuracion`.

## Pantalla de configuración

`/configuracion` resolverá automáticamente la única organización interna existente y mostrará directamente:

- Información general de la plataforma.
- Entornos de Qlik Cloud.
- Acceso OAuth de Qlik.
- Automatización base.
- Usuarios autorizados.

No mostrará lista, creación ni eliminación de organizaciones.

## Compatibilidad de rutas

- `/admin/tenants` redirige a `/configuracion`.
- `/admin/tenants/:tenantId` redirige a `/configuracion`.
- El modelo interno de organización se conserva para no alterar persistencia ni aislamiento.

## Eliminación del catálogo de conexiones

- Retirar la pantalla `Conexiones para automatizaciones`.
- Eliminar configuración y listado de conexiones JDBC/SFTP del frontend.
- Eliminar el enlace de Dataflows hacia ese catálogo y el aviso de conexiones faltantes.
- No eliminar endpoints internos del backend en este cambio; quedan sin exposición visual.

## Estados de error

- Si no existe la configuración inicial, mostrar un error operativo sin permitir crear otra organización.
- Si existen varias organizaciones heredadas, usar la primera activa y mostrar la configuración sin recuperar la lista administrativa.

## Pruebas

- Navegación sin `Organizaciones`.
- Resolución de una única configuración.
- Redirecciones de rutas heredadas.
- Ausencia del catálogo y CTA de conexiones.

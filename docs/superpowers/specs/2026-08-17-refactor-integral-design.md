# Diseño — Programa integral de refactorización y endurecimiento

Fecha: 2026-08-17
Estado: aprobado en conversación
Repositorio: `qlik_reportes_creator`

## 1. Objetivo

Mejorar seguridad, mantenibilidad, claridad arquitectónica, capacidad de prueba y escalabilidad del sistema sin reescribirlo ni cambiar innecesariamente su comportamiento funcional.

El producto está diseñado para **una sola empresa**. No se diseñará ni optimizará para multi-tenancy. La arquitectura objetivo continúa siendo un **monolito modular** con principios de Clean Architecture y arquitectura hexagonal. El trabajo se ejecutará de forma incremental y verificable.

## 2. Principios de ejecución

1. Seguridad, autenticación y protección de recursos antes que refactors cosméticos.
2. Cada cambio funcional o de seguridad relevante comienza con una prueba que demuestre el problema o la regla esperada.
3. Cada fase debe dejar el repositorio en estado ejecutable y verificable.
4. Los módulos se comunican mediante contratos públicos explícitos; no mediante imports profundos de detalles internos.
5. No se introducirán microservicios, contenedores de DI complejos ni estado global frontend adicional sin necesidad demostrable.
6. No se ejecutarán consultas BigQuery potencialmente facturables durante el refactor; las pruebas usarán dobles, mocks o fakes.
7. Los archivos se dividirán por responsabilidad, no únicamente por cantidad de líneas.

## 2.1. Modelo de despliegue y tenancy

- Una instalación corresponde a una sola empresa.
- Puede haber múltiples usuarios, roles y tenants Qlik si el negocio lo requiere, pero todos pertenecen a la misma empresa.
- `organizacionId` no se usará como abstracción para vender o alojar múltiples clientes en la misma instancia.
- No se introducirá selector de organización ni autorización por organización.
- Si retirar `organizacionId` del esquema implica una migración amplia sin beneficio inmediato, se conservará temporalmente como singleton y su eliminación se evaluará como limpieza posterior.

## 3. Alcance del programa

El programa se divide en ocho subproyectos. Cada uno tendrá posteriormente su propio plan de implementación detallado y puede producir varios commits pequeños.

### Fase 1 — Seguridad de acceso y secretos

Objetivo: cerrar fallos de autenticación/autorización y de gestión de secretos antes de mover responsabilidades internas.

Incluye:
- exigir sesión autenticada en todas las operaciones sensibles de conexiones de destino por ID;
- impedir acceso anónimo a probar conexión, capacidades, recursos, preview, DDL, estimación, actualización y eliminación;
- definir explícitamente qué roles pueden modificar conexiones y cuáles sólo pueden consultarlas;
- añadir pruebas HTTP de acceso anónimo, usuario autorizado y usuario sin privilegios;
- retirar `.env.production` y `apps/api/local.db` del versionado;
- documentar como checkpoint operativo la rotación manual de secretos reales que hayan quedado en el historial Git, sin imprimir ni registrar sus valores;
- eliminar el almacenamiento de la clave maestra de cifrado junto al ciphertext en PostgreSQL;
- exigir una clave maestra externa en producción y fallar de forma explícita si falta.

La aplicación es de una sola empresa. No se añadirán pruebas Organización A / Organización B ni scoping multi-tenant. Si `organizacionId` sigue existiendo en persistencia durante el refactor, se tratará como un identificador singleton interno y no como una frontera de aislamiento entre clientes.

No incluye: reestructuración general de rutas, parser, UI o migraciones.

### Fase 2 — CI y baseline de calidad

Objetivo: hacer que los controles automáticos representen correctamente la salud del repositorio.

Incluye:
- corregir el error de formato de `apps/web/postcss.config.js`;
- separar correctamente Bun Test y Vitest desde scripts raíz;
- garantizar que el comando raíz de test no ejecute tests Vitest con Bun;
- crear setup global de Vitest para React `act` cuando corresponda;
- eliminar dependencia frágil de `process.cwd()` en tests estructurales;
- definir un comando de verificación único para desarrollo y CI;
- mantener `lint`, `typecheck`, tests backend, tests frontend y build como gates obligatorios.

Criterio de salida: todos los gates pasan desde la raíz sin comandos manuales especiales.

### Fase 3 — Límites arquitectónicos backend

Objetivo: convertir la arquitectura declarada en reglas ejecutables.

Reglas objetivo:
- dominio no importa aplicación, HTTP, infraestructura, plataforma ni frameworks;
- aplicación depende de dominio y puertos, no de adaptadores concretos;
- HTTP puede depender de aplicación y contratos, pero no construir infraestructura de otros módulos;
- los módulos sólo consumen otros módulos mediante `publico.ts`;
- `nucleo` permanece independiente de Hono;
- `plataforma` no importa implementaciones internas específicas de módulos.

Incluye también:
- crear `publico.ts` donde falta (`reportes` y `descargas`);
- dejar de tratar `google-cloud` como bounded context: mover su resolver técnico a `plataforma/integraciones/google-cloud` (o equivalente) porque no contiene dominio ni casos de uso propios;
- reemplazar imports profundos entre módulos;
- mover helpers HTTP fuera de `nucleo`;
- desacoplar el manejador HTTP global de errores concretos de infraestructura Qlik;
- eliminar tipos de persistencia concreta de puertos de aplicación;
- ampliar `arquitectura.test.ts` para cubrir todos los módulos y capas.

### Fase 4 — Responsabilidades de reportes, automatizaciones y destinos

Objetivo: eliminar ciclos conceptuales y adelgazar las capas HTTP.

Decisión de diseño:
- `reportes` será dueño del ciclo de vida de un reporte y de su ejecución;
- `automatizaciones` encapsulará las capacidades relacionadas con Qlik Automate, sin ser dueño del estado de ejecución del reporte;
- `destinos` será dueño de conexiones, capacidades, exploración de recursos y operaciones específicas del destino;
- los mecanismos genéricos de concurrencia no pertenecerán a `automatizaciones` si son consumidos por `reportes`.

Se crearán casos de uso explícitos para operaciones actualmente embebidas en rutas, por ejemplo `ObtenerConexionDestino`, `ProbarConexionDestino`, `ListarRecursosDestino`, `ObtenerPreviewDestino` y `EstimarConsultaDestino`.

Los handlers HTTP validarán entrada, obtendrán contexto, invocarán un caso de uso y traducirán la respuesta. No construirán clientes externos ni casos de uso durante cada request.

### Fase 5 — Composition root, persistencia y configuración

Objetivo: reducir acoplamiento operativo y hacer explícitas las dependencias.

Incluye:
- mantener un único composition root lógico, pero dividir el ensamblado físico por módulo;
- reducir `app.ts` a configuración global, middleware y montaje de módulos;
- inyectar `db` en repositorios y servicios de persistencia en lugar de importar un singleton global;
- leer variables de entorno en una frontera de configuración tipada e inyectar valores al resto del sistema;
- dividir `plataforma/persistencia/esquema.ts` por bounded context con un barrel común;
- reemplazar el ejecutor custom de migraciones en startup por un flujo único basado en Drizzle;
- hacer que un fallo de migración detenga el despliegue;
- evitar transacciones PostgreSQL abiertas durante llamadas Qlik/BigQuery externas;
- rediseñar el bloqueo de ejecución usando una estrategia que no retenga una transacción durante I/O remoto.

### Fase 6 — Arquitectura frontend y hooks

Objetivo: establecer la dirección `app → features → shared` y adelgazar páginas complejas.

Incluye:
- mover `use-tenant-activo` al módulo propietario de sesión/autenticación;
- sacar utilidades específicas de reportes de `compartido`;
- mover `contexto-vista` a una capa neutral si múltiples features lo necesitan;
- eliminar el ciclo conceptual `reportes ↔ flujos` definiendo ownership o un read model neutral;
- crear `modulos/destinos/api.ts` y trasladar allí las APIs de conexiones/recursos actualmente en `reportes/api.ts`;
- centralizar factories de query keys;
- crear hooks de consulta/mutación por caso de uso, sin convertir estado visual trivial en hooks artificiales.

Páginas prioritarias para extraer controladores/hooks:
- `PaginaAutomatizaciones`: listado, filtros, ejecución y paginación;
- `PaginaDetalleAutomatizacion`: detalle, preflight, polling, auditoría, ejecución y detención;
- `PaginaTablasDestino`: conexión activa, recursos, detalle y preview;
- `LayoutPrincipal`: sesión, permisos, cambio de tenant, guards y navegación.

Los componentes de presentación recibirán datos y callbacks ya preparados. TanStack Query seguirá siendo la capa de caché remota; no se añadirá otro store global por este refactor.

### Fase 7 — Archivos grandes y código limpio

Objetivo: reducir carga cognitiva después de estabilizar los límites de responsabilidad.

Candidatos principales:
- `parser-dataflow.ts`: separar tokenización, LOAD, SELECT, joins, expresiones, STORE y normalización;
- `compilador-bigquery.ts`: separar identificadores, expresiones, funciones, joins, CTEs y SELECT;
- repositorio de autenticación: separar sesiones, identidades, credenciales y consultas de tenant;
- cliente HTTP Qlik: separar transporte de APIs por recurso;
- rutas OAuth: separar login, callback, sesión y cookies;
- schema PostgreSQL: ya preparado por bounded context desde la fase 5;
- componentes frontend grandes: extraer controladores y componentes sólo cuando exista una responsabilidad identificable.

Los límites de líneas serán señales de revisión, no reglas automáticas de diseño.

### Fase 8 — Escalabilidad y preparación de producción

Objetivo: eliminar cuellos de botella que aparecen al escalar horizontalmente.

Incluye:
- lazy loading de rutas/páginas para reducir el bundle inicial del frontend;
- decidir y documentar un rate limiter compartido cuando existan múltiples réplicas;
- implementar un dispatcher del outbox con claim, retry y estado, o retirar el outbox hasta necesitarlo;
- revisar locks distribuidos/leases para ejecuciones largas;
- asegurar que cabeceras de proxy usadas para identificar IP sólo se confíen detrás de proxies controlados;
- añadir observabilidad alrededor de integraciones y tiempos de ejecución;
- incorporar budgets de arquitectura/complejidad que detecten regresiones sin bloquear cambios legítimos;
- actualizar README y documentación de arquitectura al diseño real resultante.

## 4. Flujo objetivo de backend

```text
HTTP
  → middleware global
  → validación Zod/contrato
  → contexto autenticado { usuario, roles, tenantQlikId }
  → caso de uso del módulo propietario
  → puertos de dominio/aplicación
  → adaptadores PostgreSQL/Qlik/BigQuery/GCS
  → auditoría/outbox cuando aplique
  → respuesta normalizada { exito, datos | error }
```

## 5. Flujo objetivo de frontend

```text
app shell/router
  → feature/page
  → hook/controlador de feature
  → cliente API del módulo propietario
  → backend

shared
  → componentes, utilidades y hooks neutrales
  → nunca importa una feature
```

Las páginas coordinan la experiencia de usuario; no deben concentrar lógica de transporte, caché, polling, permisos y transformación de dominio simultáneamente.

## 6. Manejo de errores

- Backend: todas las rutas devolverán el envelope común `{ exito, datos }` o `{ exito, error }`.
- Los errores de infraestructura se traducirán a errores de aplicación en la frontera del adaptador o caso de uso apropiado.
- No se filtrarán detalles internos, credenciales, SQL sensible ni respuestas crudas de proveedores.
- Las migraciones y configuración crítica de seguridad fallarán de forma explícita; no habrá fallbacks silenciosos que comprometan integridad o cifrado.

## 7. Estrategia de pruebas

Cada subproyecto debe combinar pruebas de comportamiento y reglas estructurales.

Prioridades:
- tests de autenticación y autorización para toda operación sensible por ID;
- tests unitarios de casos de uso con puertos falsos;
- tests de adaptadores para queries parametrizadas y filtros esperados;
- tests HTTP para envelope, autenticación, autorización y códigos de estado;
- tests arquitectónicos que recorran imports y fallen ante dependencias prohibidas;
- Vitest/Testing Library para comportamiento frontend y hooks;
- tests específicos del parser y compilador antes de dividirlos, de modo que el refactor sea caracterizable;
- ninguna prueba de CI debe requerir una consulta BigQuery real ni producir costo externo.

## 8. Gates de calidad por fase

Antes de declarar una fase terminada deben pasar, desde la raíz, los comandos canónicos definidos en la fase 2 para:
- lint/format;
- typecheck;
- tests backend y contratos;
- tests frontend;
- build backend y frontend;
- tests de arquitectura.

Además, `git diff` debe contener únicamente cambios correspondientes al alcance de la fase.

## 9. No objetivos

Este programa no pretende:
- convertir el sistema en microservicios;
- cambiar React, Hono, Drizzle, PostgreSQL o TanStack Query por preferencias estéticas;
- añadir Redux/Zustand para sustituir estado local o caché remota ya correctamente resueltos;
- reescribir parser o compilador desde cero;
- cambiar comportamiento de negocio salvo donde sea necesario para corregir seguridad o inconsistencias demostradas;
- optimizar prematuramente para una escala no observada;
- ejecutar integraciones externas costosas durante pruebas automatizadas.

## 10. Dependencias y orden

La fase 1 y la fase 2 son bloqueantes para el resto: seguridad crítica y red de pruebas fiable. La fase 1 se diseña explícitamente para una sola empresa, sin aislamiento multi-tenant.

La fase 3 establece los límites que la fase 4 debe respetar. La fase 4 aclara ownership antes de reducir `app.ts` y persistencia en la fase 5. La fase 6 puede ejecutarse después de 2 y 3, pero se mantendrá detrás de la fase 5 para reducir trabajo paralelo sobre contratos. La fase 7 depende de límites estabilizados. La fase 8 se realiza al final porque contiene optimizaciones y decisiones operativas que deben apoyarse en una arquitectura ya limpia.

Orden acordado:

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`

## 11. Estrategia de commits

Los planes detallados favorecerán commits pequeños y reversibles. Un commit debe representar una sola intención comprobable: test de caracterización, corrección de seguridad, extracción de puerto, migración de imports, extracción de hook, etc.

No se realizará un commit monolítico con las ocho fases.

## 12. Criterios de éxito del programa

El programa se considera completado cuando:
- ninguna operación sensible de destinos puede ejecutarse sin sesión válida y permisos suficientes;
- no existen secretos reales ni bases locales versionadas;
- el pipeline raíz de calidad pasa de forma reproducible;
- las reglas de arquitectura están automatizadas y no dependen sólo de documentación;
- no existen imports internos entre bounded contexts salvo excepciones explícitas y documentadas;
- el sistema no contiene complejidad añadida exclusivamente para soportar múltiples empresas;
- `reportes`, `automatizaciones` y `destinos` tienen ownership comprensible sin ciclos conceptuales;
- composition, configuración y persistencia usan dependencias explícitas;
- las migraciones no se ejecutan silenciosamente en cada réplica al arrancar;
- frontend respeta `app → features → shared` y las páginas prioritarias tienen responsabilidades reducidas;
- parser, compilador y adaptadores grandes están divididos únicamente donde mejora cohesión;
- los mecanismos de rate limit, locks y outbox tienen una estrategia compatible con despliegue horizontal;
- README y documentación de arquitectura coinciden con el sistema implementado.

## 13. Decisión final

Se adopta el enfoque **incremental por fases**, manteniendo el monolito modular actual y reforzando sus límites en lugar de reemplazar la arquitectura.

La siguiente etapa, una vez revisada esta especificación, es producir planes de implementación detallados por subproyecto mediante Superpowers `writing-plans`, empezando por las fases P0.

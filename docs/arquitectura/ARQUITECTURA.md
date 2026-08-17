# Arquitectura — Qlik Reportes Creator

## Decisión principal

El sistema es un **monolito modular** que persiste en PostgreSQL y se integra con Qlik Cloud, Qlik Automate, Talend, BigQuery y GCS.

```
Usuario → qlik_reportes_creator → Qlik Dataflow (lectura)
                              → Qlik Automate → Talend → BigQuery → GCS
                              → BigQuery (preflight/resultados)
                              → GCS (descargas firmadas)
PostgreSQL = persistencia interna
```

- **Qlik Dataflow** define fuentes, campos, filtros, joins y agregaciones. Se relee en cada ejecución.
- **Qlik Automate** orquesta el Job de Talend. La plataforma actualiza el workspace antes de disparar.
- **Talend** ejecuta el SQL compilado en BigQuery y exporta a GCS.
- **BigQuery** es el motor de cálculo y preflight.
- **GCS** (`bkt_dwh/POCs/TalendDescargados/`) recibe los CSV firmados.
- **PostgreSQL** solo persiste estado interno: organizaciones, sesiones, reportes y auditoría de ejecuciones.

## Estructura

```text
apps/api/src/
├── app.ts                 # Composition root
├── entradas/              # Bun, Node y adaptación opcional
├── plataforma/            # HTTP, configuración, persistencia, seguridad y observabilidad
├── nucleo/                # Errores, eventos, auditoría, idempotencia, tiempo y valores
└── modulos/
    ├── autenticacion-qlik/
    ├── qlik/
    ├── flujos/
    ├── destinos/
    ├── automatizaciones/
    └── admin/
```

Cada módulo expone únicamente `publico.ts` y organiza su código en `dominio`, `aplicacion`, `infraestructura` y `http` según lo que necesite. Ningún módulo debe importar detalles internos de infraestructura de otro módulo.

El frontend mantiene módulos verticales equivalentes bajo `apps/web/src/modulos`, mientras los clientes HTTP, componentes y hooks reutilizables viven en `apps/web/src/compartido`.

## Flujo de una solicitud

```text
HTTP → middleware → validación de contrato → sesión/organización/tenant
→ caso de uso → dominio → puerto → adaptador PostgreSQL/Qlik/API de destinos
→ auditoría/outbox → respuesta normalizada
```

Las respuestas usan el contrato común `{ exito, datos }` o `{ exito, error }`. Los errores internos no se exponen al cliente.

## Persistencia y seguridad

- PostgreSQL 17 es la fuente de verdad.
- Los tokens Qlik se almacenan cifrados con AES-256-GCM.
- Las sesiones guardan únicamente el hash del token.
- OAuth usa Authorization Code, PKCE y `state` de un solo uso.
- Todas las configuraciones de automatización incluyen `organizacionId` y `tenantQlikId`.
- Las operaciones mutables críticas usan idempotencia, auditoría y outbox.
- Solo puede existir un tenant principal por organización; una organización también puede no tener principal durante una migración o desconexión.

## Integraciones

Qlik Cloud, BigQuery y GCS son puertos reemplazables. El frontend nunca consume directamente esas integraciones: todas las llamadas atraviesan el backend.

PostgreSQL es exclusivamente persistencia interna.

## Despliegue

El artefacto de producción se construye con Bun y se ejecuta con Node.js 22 dentro de Docker. `compose.yaml` proporciona PostgreSQL para desarrollo y despliegues simples. Cloudflare Worker no forma parte de la plataforma principal.

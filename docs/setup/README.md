# Configuración Inicial

## Arranque

```bash
cp .env.example .env
docker compose up --build
```

Abre `http://localhost:4524` y completa el wizard de configuración. La API está disponible en `http://localhost:4523`.

## Wizard

1. Crea la organización.
2. Registra el tenant, Client ID y Client Secret de Qlik Cloud.
3. Define el superadministrador.

Antes del primer arranque, ejecuta `bun run db:migrate`. Los cambios futuros se gestionan con nuevas migraciones Drizzle.

## Variables de entorno

`PORT_WEB`, `PORT_API`, `HOST_IP` y `DATABASE_URL` controlan el entorno local. Las credenciales OAuth y la clave de cifrado son opcionales hasta que se configure Qlik desde la interfaz. Consulta [el ejemplo de entorno](../../.env.example) y la [guía local](../desarrollo/guia-arranque-local.md).

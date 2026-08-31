# Checklist de producción

Usa este documento como lista **go/no-go** durante un despliegue. La explicación completa está en [LEVANTAR-DESDE-CERO.md](LEVANTAR-DESDE-CERO.md).

## Antes de la ventana

- [ ] Dominio HTTPS definitivo disponible.
- [ ] Redirect URI de Qlik = `${FRONTEND_URL}/api/auth/qlik/callback`.
- [ ] Client ID/Secret y scopes Qlik preparados.
- [ ] BigQuery dataset + GCS bucket/prefijo + Service Account preparados.
- [ ] Backup externo disponible.
- [ ] Commit anterior anotado para rollback.
- [ ] Cambios pasaron `bun run verify` y `git diff --check`.

## Servidor

- [ ] `git status --short --branch` limpio.
- [ ] `docker` activo y habilitado al boot.
- [ ] Espacio de disco suficiente.
- [ ] `.env` existe y tiene modo `600`.
- [ ] `FRONTEND_URL` es HTTPS y no contiene localhost.
- [ ] `PORT_API=4523`.
- [ ] `POSTGRES_PASSWORD` no es placeholder.
- [ ] `CIFRADO_CLAVE_PRINCIPAL` corresponde a la instalación y decodifica a 32 bytes.
- [ ] En una instalación histórica, la clave `.env` fue reconciliada con `app_config` antes del cutover.

## Preflight

```bash
./scripts/ops/backup.sh
./scripts/ops/release-check.sh
git diff --check
docker compose config --quiet
docker compose build
```

- [ ] Backup generado y `gzip -t` pasa.
- [ ] Build termina sin error antes del cutover.

## Cutover

```bash
docker compose up -d
docker compose ps -a
```

- [ ] `postgres` healthy.
- [ ] `migrate` Exited (0).
- [ ] `api` healthy.
- [ ] `web` healthy.

## Salud local

```bash
HOST=127.0.0.1 PORT_WEB=<puerto> ./scripts/ops/smoke.sh
```

- [ ] `/api/live` OK.
- [ ] `/api/ready` OK + DB connected.
- [ ] `/api/salud` OK.
- [ ] `/api/setup/status` responde.

## Entrada pública

- [ ] `cloudflared` corre como `systemd`, no como proceso manual.
- [ ] `systemctl is-enabled cloudflared` = enabled.
- [ ] `systemctl is-active cloudflared` = active.
- [ ] fallback del túnel = `http_status:404`.
- [ ] dominio público `/api/ready` OK.

## Aplicación

- [ ] Setup completado si era instalación nueva.
- [ ] Login Qlik iniciado desde el dominio público.
- [ ] Callback vuelve al dominio público, nunca a localhost.
- [ ] No aparece `OAUTH_ESTADO_INVALIDO`.
- [ ] BigQuery “Guardar y verificar” OK.
- [ ] Plantilla de automatización configurada.
- [ ] Dataflow(s) configurados.
- [ ] Usuario real puede entrar y operar.
- [ ] Descarga de prueba funciona.

## Después

- [ ] Revisados logs API/web de los últimos minutos; sin 5xx nuevos relevantes.
- [ ] Backup post-deploy creado si hubo migraciones/configuración importante.
- [ ] Backup + `.env`/clave guardados fuera del servidor.
- [ ] Commit desplegado registrado.
- [ ] Rollback commit/tag conocido.

**NO-GO:** si falla migración, readiness, callback OAuth, descifrado de secretos o restore del backup crítico, no declares producción terminada.

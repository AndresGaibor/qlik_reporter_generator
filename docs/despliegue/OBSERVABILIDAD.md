# Observabilidad operativa

La guía canónica está en [LEVANTAR-DESDE-CERO.md](LEVANTAR-DESDE-CERO.md).

## Capacidades que existen hoy

### Health endpoints

| Endpoint | Uso |
| --- | --- |
| `GET /api/live` | proceso API vivo |
| `GET /api/ready` | API lista y PostgreSQL accesible |
| `GET /api/salud` | estado general/arquitectura |
| `GET /api/setup/status` | estado del bootstrap inicial |

Prueba pública recomendada para monitor externo: `/api/ready`.

### Logs API

La API escribe eventos JSON estructurados a stdout/stderr mediante el registrador interno.

```bash
docker compose logs api --tail=200
docker compose logs -f api
```

El formato actual contiene campos como `nivel`, `evento`, `trazaId`, ruta HTTP y duración cuando aplica. No dependas de un formato Pino específico solo porque el paquete exista en dependencias.

### Logs web/Nginx

```bash
docker compose logs web --tail=200
docker compose exec -T web sh -lc 'tail -100 /var/log/nginx/error.log'
```

### Estado Docker

```bash
docker compose ps -a
docker inspect qlik_reportes_creator-api-1 --format='{{.State.Health.Status}}'
docker inspect qlik_reportes_creator-web-1 --format='{{.State.Health.Status}}'
```

### Cloudflare Tunnel

```bash
systemctl is-active cloudflared
systemctl status cloudflared --no-pager
journalctl -u cloudflared --since '15 min ago' --no-pager
```

## Lo que NO existe todavía

El proyecto no expone actualmente:

- endpoint Prometheus `/metrics`;
- métricas `http_requests_total`/histogramas Prometheus;
- stack Grafana/Prometheus incluido en Compose;
- trazas OpenTelemetry exportadas a un collector.

No escribas alertas contra métricas inexistentes. Si se implementan en el futuro, documenta primero el contrato real y su despliegue.

## Monitor externo mínimo recomendado

Configura un monitor HTTPS para:

```text
GET https://DOMINIO/api/ready
```

Además vigila:

- certificado/DNS/dominio;
- `cloudflared` activo;
- contenedores unhealthy/restarting;
- disco disponible;
- errores HTTP 5xx en logs;
- fecha/tamaño del último backup;
- éxito de jobs de backup si se automatizan.

## Diagnóstico OAuth

```bash
docker compose logs api --since=15m | grep -E 'autenticacion|oauth|http.solicitud'
```

No copies a herramientas externas códigos OAuth, tokens, cookies ni secretos completos.

## Auditoría

La aplicación dispone de persistencia de auditoría para acciones sensibles de negocio/configuración. La auditoría de aplicación complementa, no reemplaza, logs de Docker, Cloudflare, Qlik y Google Cloud.

# Observabilidad - Qlik Automate Creator

## Métricas Disponibles

### Health Endpoints

| Endpoint | Propósito | Respuesta |
|----------|-----------|-----------|
| `GET /api/live` | Liveness probe | `{ estado: "ok", fecha: "..." }` |
| `GET /api/ready` | Readiness probe | `{ estado: "ok", fecha: "...", db: "connected" }` |
| `GET /api/salud` | Estado general | `{ estado: "ok", fecha: "...", arquitectura: "..." }` |

## Logs

### API (Bun/Hono)

Logs van a stdout/stderr del contenedor.

```bash
# Ver logs de API
docker compose -f compose.yaml logs api

# Logs en tiempo real
docker compose -f compose.yaml logs -f api

# Últimas 100 líneas
docker compose -f compose.yaml logs --tail=100 api
```

### Nginx

```bash
# Ver logs de acceso
docker compose -f compose.yaml logs web

# Dentro del contenedor
docker exec qlik_reportes_creator-web-1 cat /var/log/nginx/access.log
docker exec qlik_reportes_creator-web-1 cat /var/log/nginx/error.log
```

## Monitoreo con Healthchecks

### Script de Smoke Test

```bash
# Ejecutar smoke tests
./scripts/ops/smoke.sh

# Con salida detallada
HOST=tu-servidor PORT_WEB=4524 ./scripts/ops/smoke.sh
```

### Docker Healthcheck

Los contenedores tienen healthchecks configurados:

```bash
# Ver estado de salud
docker inspect qlik_reportes_creator-api-1 --format='{{.State.Health}}'
docker inspect qlik_reportes_creator-web-1 --format='{{.State.Health}}'
```

## Alertas Recomendadas

### Kubernetes/External Monitoring

```yaml
# Alerta: API no responde
- alert: QlikAPIUnhealthy
  expr: http_requests_total{status!~"2.."}[5m] > 0
  annotations:
    summary: "API returns non-2xx responses"

# Alerta: DB desconectada
- alert: QlikAPIDBUnhealthy
  expr: http_requests_total{endpoint="/api/ready"}[5m] == 0
  annotations:
    summary: "API cannot connect to database"

# Alerta: Servicio caido
- alert: QlikServiceDown
  expr: up{job="qlik-automate"} == 0
  annotations:
    summary: "Qlik Automate service is down"
```

## Dashboards Recomendados

### Prometheus + Grafana

Métricas a monitorear:

- `http_requests_total` - Total de requests por endpoint y status
- `http_request_duration_seconds` - Latencia de requests
- `docker_container_cpu_seconds_total` - Uso de CPU
- `docker_container_memory_usage_bytes` - Uso de memoria

### Paneles de Grafana

1. **Salud General**
   - Status de todos los servicios
   - Tiempo desde último backup
   - Versión desplegada

2. **Rendimiento**
   - Requests por minuto
   - Latencia p50, p95, p99
   - Errores 5xx

3. **Recursos**
   - CPU y memoria por contenedor
   - Conexiones DB activas
   - Espacio en disco

## Logs Estructurados

La API usa Pino para logs estructurados:

```json
{
  "level": 30,
  "time": 1699999999999,
  "pid": 1,
  "hostname": "api-container",
  "msg": "Request completed",
  "method": "GET",
  "url": "/api/salud",
  "status": 200,
  "duration": 5
}
```

## Trazas Distribuidas

Para implementar trazas (futuro):

- OpenTelemetry
- Jaeger o Zipkin como backend
- Headers de correlación (`X-Request-ID`)

## Auditoría

La aplicación registra acciones sensibles:

- Login/logout de usuarios
- Cambios de configuración
- Ejecuciones de reportes
- Acceso a datos sensibles

Logs de auditoría van a la tabla `auditoria` en PostgreSQL.

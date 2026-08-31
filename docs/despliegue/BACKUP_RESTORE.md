# Backup, restore y recuperación

La guía general está en [LEVANTAR-DESDE-CERO.md](LEVANTAR-DESDE-CERO.md).

## Qué debe formar una unidad de recuperación

Para recuperar producción no basta con PostgreSQL. Conserva:

- dump PostgreSQL;
- `.env` protegido;
- `CIFRADO_CLAVE_PRINCIPAL` correspondiente;
- commit/tag desplegado;
- configuración/credenciales del Cloudflare Tunnel;
- `compose.override.yaml` local, si existe;
- documentación de dependencias Qlik/Google necesarias.

Guarda al menos una copia fuera del host.

## Backup PostgreSQL

```bash
./scripts/ops/backup.sh
```

Variables opcionales:

| Variable | Default |
| --- | --- |
| `BACKUP_DIR` | `./backups` |
| `CONTAINER_NAME` | `qlik_reportes_creator-postgres-1` |
| `DB_NAME` | `qlik_automatizaciones` |
| `POSTGRES_USER` | `qlik_app` |

El script usa `pg_dump`, comprime con gzip y conserva los siete dumps más recientes de su patrón local.

Verifica el archivo:

```bash
gzip -t ./backups/postgres_qlik_automatizaciones_FECHA.sql.gz
ls -lh ./backups/
```

## Política recomendada

Ajusta a los requisitos del negocio, pero como base:

- backup antes de cada despliegue con migraciones;
- backup periódico automatizado;
- copia fuera del servidor;
- retención suficiente para cubrir errores descubiertos tarde;
- restore drill periódico.

No dependas exclusivamente de “los últimos 7” del script si necesitas una retención mayor: copia los artefactos a almacenamiento externo antes de la limpieza local.

## Restore de producción

**Destructivo sobre la DB destino.**

```bash
docker compose stop api web
./scripts/ops/restore.sh ./backups/postgres_qlik_automatizaciones_FECHA.sql.gz
docker compose up -d
HOST=127.0.0.1 PORT_WEB=<puerto> ./scripts/ops/smoke.sh
```

El script:

1. valida que el gzip sea legible;
2. crea un `pre_restore_*` del estado actual;
3. termina conexiones activas;
4. ejecuta `DROP DATABASE` y `CREATE DATABASE` por separado;
5. restaura con `psql -v ON_ERROR_STOP=1`, por lo que un error SQL detiene el proceso.

Después de restaurar prueba:

- `/api/ready`;
- login OAuth;
- configuración Qlik;
- descifrado/prueba BigQuery;
- una operación funcional representativa.

## Restore drill aislado

No esperes a una emergencia para descubrir que el dump está corrupto. Restaura periódicamente en una DB/contenedor temporal y verifica tablas/datos básicos.

Nunca hagas el ensayo con `docker compose down -v` sobre producción.

## Qué no hacer

```bash
docker compose down -v
```

No es backup, restore ni rollback; elimina el volumen persistente del proyecto.

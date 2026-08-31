# Secretos de producción

La guía canónica de despliegue está en [LEVANTAR-DESDE-CERO.md](LEVANTAR-DESDE-CERO.md).

## Principios

- Nunca hagas commit de `.env`, OAuth Client Secrets, tokens ni JSON de Service Account.
- Usa secretos aleatorios y distintos por ambiente.
- Limita permisos de archivos (`chmod 600 .env`).
- Respalda los secretos necesarios para recuperación fuera del servidor.
- No rote secretos “por rutina” sin entender su procedimiento: una rotación mal hecha puede causar una caída.

## `POSTGRES_PASSWORD`

Para una instalación nueva:

```bash
openssl rand -hex 32
```

Debe existir en `.env`. Cambiar solo `.env` **no cambia la contraseña dentro de PostgreSQL**.

Una rotación requiere coordinar DB y aplicaciones. Haz backup primero y evita imprimir el nuevo password en logs/shell history.

## `CIFRADO_CLAVE_PRINCIPAL`

Es una clave AES-256-GCM. Genera 32 bytes y codifícalos en Base64:

```bash
openssl rand -base64 32
```

Comprueba sin mostrarla:

```bash
bytes=$(printf '%s' "$CIFRADO_CLAVE_PRINCIPAL" | base64 -d 2>/dev/null | wc -c)
test "$bytes" -eq 32
unset bytes
```

### Regla de oro

**No cambies esta clave en una instalación existente salvo que exista un procedimiento explícito de recifrado.**

La aplicación no implementa actualmente una rotación automática de todos los secretos cifrados. La documentación histórica que afirmaba lo contrario era incorrecta.

### Instalaciones históricas

El código puede haber persistido una clave generada en `app_config` con la clave lógica `cifrado_clave_principal` cuando la variable de entorno no estaba definida.

Antes de empezar a pasar `CIFRADO_CLAVE_PRINCIPAL` desde `.env` a una instalación antigua:

1. crea backup de PostgreSQL;
2. respalda `.env` actual;
3. comprueba si `app_config` contiene `cifrado_clave_principal`;
4. si existe, sincroniza `.env` con **esa misma clave** de forma segura;
5. prueba que OAuth/BigQuery sigan pudiendo descifrarse;
6. solo entonces elimina dependencias del comportamiento histórico.

Nunca publiques el valor al comparar claves. Compara hashes o longitudes de forma local si necesitas diagnóstico.

## Qlik OAuth Client Secret

Normalmente se introduce desde el wizard/administración por tenant. La aplicación lo cifra antes de persistirlo.

Si se compromete:

1. revócalo/rotalo en Qlik Cloud;
2. actualiza la configuración del tenant en la aplicación;
3. inicia un login nuevo;
4. invalida/revisa sesiones según corresponda;
5. revisa auditoría/logs.

## Google Service Account

El JSON se usa al configurar BigQuery y se cifra antes de persistirse. No lo dejes en el directorio del repositorio ni en backups sin protección.

Aplica mínimo privilegio sobre:

- proyecto/dataset BigQuery requerido;
- bucket/prefijo GCS requerido;
- operaciones concretas de lectura/escritura que use la aplicación.

## Cloudflare Tunnel

Protege el archivo de credenciales del túnel y `config.yml`. Inclúyelos en el plan de recuperación, pero no en Git.

## Backups y cifrado

Un dump de PostgreSQL y la clave necesaria para descifrar sus secretos deben almacenarse de forma separada/protegida según el modelo de amenazas. Un backup presente únicamente en el mismo disco del servidor no cuenta como recuperación externa.

## Escaneo del repositorio

```bash
./scripts/ops/secret-scan.sh
```

El script hace un escaneo básico; no sustituye secret scanning del proveedor Git ni revisión de historial si un secreto fue commiteado.

## Si un secreto se filtra

- Revoca/rota el secreto real en el proveedor.
- No basta con borrarlo del último commit: puede seguir en el historial.
- Revisa accesos/auditoría desde el momento de exposición.
- Reemplaza credenciales en producción de forma coordinada.
- Documenta el incidente sin copiar el secreto comprometido.

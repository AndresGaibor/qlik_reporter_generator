# Despliegue limpio de Qlik Reportes Creator

> **Fuente de verdad operativa.** Esta es la guía canónica para instalar, publicar, verificar, actualizar y recuperar producción. Si otra guía contradice este documento, prevalecen este archivo, `compose.yaml`, `Dockerfile` y los scripts de `scripts/ops/`.

Última revisión operativa: 31 de agosto de 2026.

## 0. Qué significa “despliegue terminado”

Un despliegue no está terminado solo porque `docker compose up -d` no dio error. Deben cumplirse todos estos puntos:

- `main` está limpio y el commit desplegado es conocido.
- `.env` usa secretos reales, permisos `600` y una URL HTTPS pública correcta.
- PostgreSQL está `healthy` y no se publica a Internet.
- `migrate` terminó con código `0`.
- `api` y `web` están `healthy`.
- `/api/live`, `/api/ready`, `/api/salud` y `/api/setup/status` responden por el origen local.
- El dominio HTTPS público responde a `/api/ready`.
- Cloudflare Tunnel corre como servicio del sistema y sobrevive reinicios.
- El callback OAuth de Qlik usa el mismo origen público, nunca `localhost`.
- El login Qlik completa el ciclo y vuelve al dominio público.
- Qlik, BigQuery y GCS están probados desde la aplicación.
- Existe un backup verificado y una copia fuera del host.
- Se conoce el procedimiento de rollback y el commit anterior.

Usa [CHECKLIST-PRODUCCION.md](CHECKLIST-PRODUCCION.md) durante una ventana de despliegue.

## 1. Arquitectura de producción

```text
Navegador
  │ HTTPS
  ▼
Cloudflare Tunnel
  │ HTTP a 127.0.0.1:PORT_WEB
  ▼
web (Nginx dentro del contenedor)
  ├── /          → React/Vite estático
  └── /api/*     → api:4523
                     │
                     ├── Qlik Cloud / Google Cloud  (egress-network)
                     └── PostgreSQL 17               (qlik-network interna)

migrate (one-shot) ───────────────────────────────→ PostgreSQL 17
```

Reglas importantes:

- No existe un servicio Compose `nginx` separado; Nginx vive en `web`.
- El servicio `migrate` es la autoridad de migraciones en Docker.
- PostgreSQL solo vive en la red interna `qlik-network`.
- `api` necesita además `egress-network` para Qlik/Google.
- `web` necesita `ingress-network` para poder publicar el puerto al host.
- El puerto interno del API es `4523`; no lo cambies en producción sin cambiar Nginx y healthchecks.

## 2. Datos que debes tener antes de tocar el servidor

Prepara fuera de la ventana de despliegue:

1. Dominio público, por ejemplo `https://reportes.ejemplo.com`.
2. Acceso al DNS/Cloudflare de ese dominio.
3. Tenant Qlik Cloud, por ejemplo `empresa.us.qlikcloud.com`.
4. OAuth Client ID y Client Secret de Qlik.
5. Permisos para registrar el Redirect URI de Qlik.
6. Proyecto/dataset de BigQuery.
7. Bucket y prefijo GCS para reportes.
8. JSON de una cuenta de servicio Google con los permisos necesarios.
9. Correo/nombre del primer superadministrador.
10. Ubicación externa donde guardar backups y `.env` cifrado.

No empieces un despliegue si falta el dominio definitivo. Cambiar el origen después obliga a revisar OAuth y cookies.

## 3. Preparar Debian desde cero

Debian 12 es la referencia actualmente probada. Debian 13 también está soportado por Docker Engine oficial.

Actualiza el sistema e instala utilidades:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git openssl netcat-openbsd gnupg
```

Comprueba hora y zona horaria; OAuth depende de una hora razonablemente correcta:

```bash
timedatectl
```

### 3.1 Instalar Docker Engine desde el repositorio oficial

Evita paquetes antiguos como `docker.io`/`docker-compose` si vas a hacer una instalación limpia.

```bash
sudo apt remove -y docker.io docker-compose docker-doc docker-buildx podman-docker containerd runc 2>/dev/null || true
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

Comprueba:

```bash
docker --version
docker compose version
systemctl is-enabled docker
systemctl is-active docker
```

Si agregas el usuario al grupo `docker`, recuerda que ese grupo equivale prácticamente a acceso root sobre el host:

```bash
sudo usermod -aG docker "$USER"
```

Cierra y vuelve a abrir sesión antes de depender de ese cambio.

### 3.2 Firewall y puertos

Docker puede interactuar con reglas de firewall de forma distinta a servicios normales. La estrategia recomendada aquí es **no publicar la aplicación en `0.0.0.0`**: usa `HOST_IP=127.0.0.1` y publica hacia Internet únicamente mediante Cloudflare Tunnel.

En el host no debe aparecer PostgreSQL expuesto en una IP pública.

Después del despliegue verifica:

```bash
ss -lntp
```

El frontend debería escuchar solo en `127.0.0.1:PORT_WEB` salvo un bind Tailscale explícito.

## 4. Usuario y directorio de despliegue

No trabajes como `root` salvo para tareas de sistema. Ejemplo:

```bash
sudo mkdir -p /opt/qlik-reportes-creator
sudo chown "$USER":"$USER" /opt/qlik-reportes-creator
```

Clona el repositorio correcto:

```bash
git clone https://github.com/AndresGaibor/qlik_reporter_generator.git /opt/qlik-reportes-creator
cd /opt/qlik-reportes-creator
git switch main
git pull --ff-only origin main
```

Verifica identidad del checkout:

```bash
git remote -v
git status --short --branch
git log -1 --oneline
```

El árbol tracked debe estar limpio antes de producción.

## 5. Crear `.env` de producción

```bash
cp .env.production.example .env
chmod 600 .env
```

Genera secretos nuevos **solo para una instalación realmente nueva**:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Usa el hexadecimal como `POSTGRES_PASSWORD` y el Base64 como `CIFRADO_CLAVE_PRINCIPAL`.

Configuración mínima:

```dotenv
COMPOSE_PROJECT_NAME=qlik_reportes_creator
HOST_IP=127.0.0.1
PORT_WEB=4524
PORT_API=4523
FRONTEND_URL=https://reportes.ejemplo.com
POSTGRES_USER=qlik_app
POSTGRES_PASSWORD=<password-aleatorio>
CIFRADO_CLAVE_PRINCIPAL=<32-bytes-en-base64>
GOOGLE_SIGNED_URL_MINUTOS=15
```

Reglas:

- `FRONTEND_URL` debe ser HTTPS, sin slash final y sin `localhost`.
- `PORT_API` debe permanecer en `4523` con la configuración actual.
- `POSTGRES_PASSWORD` no debe contener placeholders del ejemplo.
- `CIFRADO_CLAVE_PRINCIPAL` debe decodificar exactamente a 32 bytes.
- `DATABASE_URL` no hace falta en `.env` para Docker: Compose la construye con el host interno `postgres`.
- No definas `QLIK_REDIRECT_URI` normalmente; producción lo deriva de `FRONTEND_URL`.
- Nunca hagas commit de `.env`.

Comprueba la clave sin imprimirla:

```bash
bytes=$(printf '%s' "$CIFRADO_CLAVE_PRINCIPAL" | base64 -d 2>/dev/null | wc -c)
test "$bytes" -eq 32
unset bytes
```

## 6. Clave de cifrado: regla crítica para instalaciones existentes

`CIFRADO_CLAVE_PRINCIPAL` cifra secretos OAuth/BigQuery. Cambiarla sin recifrar los datos hace que los secretos existentes dejen de poder descifrarse.

### Instalación nueva

Define la clave en `.env` **antes del primer arranque** y conserva una copia segura fuera del servidor.

### Instalación histórica

Versiones anteriores podían generar/persistir la clave en `app_config` bajo `cifrado_clave_principal` si la variable de entorno no existía. Antes de comenzar a inyectar una clave desde `.env`, debes comprobar que ambas sean la misma.

No sustituyas una clave histórica por una nueva “porque el `.env` la tiene”. Primero respalda DB y `.env`, recupera la clave histórica de forma segura y sincroniza `.env` sin imprimirla en tickets/logs.

Consulta [SECRETOS.md](SECRETOS.md).

## 7. Configurar Qlik OAuth antes del primer login

Para:

```text
FRONTEND_URL=https://reportes.ejemplo.com
```

el callback es:

```text
https://reportes.ejemplo.com/api/auth/qlik/callback
```

En el OAuth Client de Qlik configura exactamente el origen/redirect que corresponda al cliente web. El Redirect URI debe coincidir carácter por carácter con el callback público.

Scopes predeterminados actuales de la aplicación:

```text
user_default
offline_access
identity.name:read
identity.email:read
identity.subject:read
identity.picture:read
automations
automations.private
automations.shared
spaces:read
apps:read
data-integration
```

No registres `http://localhost:4523/api/auth/qlik/callback` para producción.

## 8. Preflight antes de construir

Ejecuta:

```bash
./scripts/ops/release-check.sh
git diff --check
docker compose config --quiet
```

No pegues `docker compose config` completo en chats/tickets porque puede expandir secretos.

Comprueba sin revelar valores:

```bash
test -n "$FRONTEND_URL"
case "$FRONTEND_URL" in
  https://*) ;;
  *) echo "FRONTEND_URL debe usar HTTPS"; exit 1 ;;
esac
case "$FRONTEND_URL" in
  *localhost*|*127.0.0.1*) echo "FRONTEND_URL no puede ser local en producción"; exit 1 ;;
esac
```

Comprueba espacio:

```bash
df -h /
docker system df
```

No hagas `docker system prune -a` automáticamente en producción.

## 9. Build reproducible

Construye antes de detener/recrear servicios:

```bash
docker compose build
```

Si el build falla, la versión que ya estaba corriendo no debería verse afectada.

No uses `--no-cache` de rutina: resérvalo para investigar un problema de caché/build.

## 10. Primer arranque

Opcionalmente valida PostgreSQL primero:

```bash
docker compose up -d postgres
docker compose ps
```

Luego levanta el stack:

```bash
docker compose up -d
docker compose ps -a
```

Orden esperado:

1. `postgres`: `healthy`.
2. `migrate`: `Exited (0)`.
3. `api`: `healthy`.
4. `web`: `healthy`.

Si `migrate` no termina con código `0`, **no intentes saltarlo**. Revisa:

```bash
docker compose logs migrate --tail=200
docker compose logs postgres --tail=100
```

En un despliegue Docker normal no ejecutes además `bun run db:migrate` desde el host.

## 11. Smoke tests del origen local

```bash
HOST=127.0.0.1 PORT_WEB=4524 ./scripts/ops/smoke.sh
```

Ajusta `PORT_WEB` si usaste otro valor.

Pruebas directas:

```bash
curl -fsS http://127.0.0.1:4524/api/live
curl -fsS http://127.0.0.1:4524/api/ready
curl -fsS http://127.0.0.1:4524/api/salud
curl -fsS http://127.0.0.1:4524/api/setup/status
```

`/api/ready` debe reportar `db: "connected"` dentro del contrato de éxito.

## 12. Cloudflare Tunnel como servicio del sistema

Para instalación del binario, creación del túnel y servicio systemd desde un Debian limpio, sigue [CLOUDFLARE-TUNNEL.md](CLOUDFLARE-TUNNEL.md).

No consideres producción terminada si `cloudflared` solo está abierto en una terminal, `tmux`, `nohup` o un proceso manual.

Para un túnel administrado localmente, ejemplo de `~/.cloudflared/config.yml`:

```yaml
tunnel: qlik-reportes
credentials-file: /home/USUARIO/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: reportes.ejemplo.com
    service: http://127.0.0.1:4524
  - service: http_status:404
```

El fallback debe ser `http_status:404`, no reenviar cualquier hostname al frontend.

Instala el servicio usando la ruta explícita de configuración si el archivo vive en el home del usuario:

```bash
sudo cloudflared --config /home/USUARIO/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
systemctl is-enabled cloudflared
systemctl is-active cloudflared
sudo systemctl status cloudflared --no-pager
```

Después de cambiar `config.yml`:

```bash
sudo systemctl restart cloudflared
```

Prueba el dominio:

```bash
curl -fsS https://reportes.ejemplo.com/api/ready
curl -fsS https://reportes.ejemplo.com/api/setup/status
```

## 13. Tailscale opcional

Tailscale es útil para administración o acceso privado, pero no es requisito del producto.

Si necesitas publicar web/API por una IP Tailscale, usa un `compose.override.yaml` **local y no versionado**:

```yaml
services:
  api:
    ports:
      - "127.0.0.1:7823:4523"
      - "${TAILSCALE_IP:?TAILSCALE_IP es obligatoria}:7823:4523"
  web:
    ports:
      - "${TAILSCALE_IP:?TAILSCALE_IP es obligatoria}:${PORT_WEB:-4524}:80"
```

Añade `TAILSCALE_IP` a `.env`. No cambies el puerto interno `4523`.

Verifica:

```bash
systemctl is-enabled tailscaled
systemctl is-active tailscaled
tailscale status
```

## 14. Wizard inicial

Abre únicamente por el dominio definitivo:

```text
https://reportes.ejemplo.com/setup
```

Completa:

1. Organización.
2. Host del tenant Qlik Cloud.
3. Client ID OAuth.
4. Client Secret OAuth.
5. Scopes requeridos.
6. Superadministrador.

No completes el setup desde `localhost` si producción se usará por otro dominio.

Después verifica:

```bash
curl -fsS https://reportes.ejemplo.com/api/setup/status
```

Debe indicar `needsSetup: false`.

## 15. Verificación OAuth obligatoria

Empieza **un login nuevo** desde:

```text
https://reportes.ejemplo.com/login
```

El flujo debe:

1. salir al tenant Qlik correcto;
2. autorizar con un `redirect_uri` público;
3. volver a `https://reportes.ejemplo.com/api/auth/qlik/callback`;
4. crear la sesión;
5. terminar en la UI pública.

### Si aparece `OAUTH_ESTADO_INVALIDO`

Un callback con `state` inválido significa normalmente que faltan las cookies PKCE/state del inicio del flujo. Una causa típica es iniciar en el dominio público y volver a `localhost`.

Comprueba:

```bash
docker compose exec -T api sh -lc 'printf "FRONTEND_URL=%s\n" "$FRONTEND_URL"'
docker compose logs api --tail=150
```

`FRONTEND_URL` dentro de `api` debe ser el dominio HTTPS público.

Comprueba también el Redirect URI del OAuth Client de Qlik. Después de corregirlo, recrea el API/web si cambió `.env` o código:

```bash
docker compose up -d --build api web
```

Y comienza un login **desde cero**. No reutilices el callback ni el `state` anterior.

La aplicación redirige callbacks inválidos de navegador a `/login?oauth_error=oauth_state_invalid`; si el setup aún está pendiente, la UI redirige automáticamente a `/setup`.

## 16. Configuración funcional después del login

Desde Configuración, por tenant:

1. Comprueba Qlik Cloud/OAuth.
2. Selecciona la plantilla base de automatizaciones.
3. Configura una o más plantillas Dataflow.
4. Configura BigQuery:
   - dataset exacto;
   - JSON de cuenta de servicio en la primera configuración;
   - bucket GCS;
   - prefijo GCS;
   - máximo de filas por CSV.
5. Ejecuta **Guardar y verificar**.
6. Configura usuarios y roles.

No guardes el JSON de la cuenta de servicio en el repositorio ni en la documentación.

## 17. Verificación de egress

El API necesita HTTPS saliente hacia Qlik y Google.

Desde el contenedor, una prueba simple:

```bash
docker compose exec -T api node -e \
  'Promise.all([fetch("https://www.google.com/generate_204"),fetch("https://www.qlik.com")]).then(r=>console.log(r.map(x=>x.status).join(","))).catch(e=>{console.error(e);process.exit(1)})'
```

La prueba funcional real sigue siendo OAuth + prueba BigQuery desde la aplicación.

## 18. Verificación funcional mínima de negocio

Antes del go-live prueba con un usuario real:

- iniciar sesión;
- cambiar/usar el tenant esperado;
- listar Dataflows permitidos;
- crear/consultar un reporte de prueba;
- ejecutar una automatización controlada;
- comprobar estado de ejecución;
- comprobar archivos en GCS;
- descargar al menos un resultado;
- si aplica, comprobar particionado CSV con el límite configurado;
- verificar que un usuario sin rol admin no acceda a Configuración.

No uses datos sensibles reales para la prueba si un dataset de prueba es suficiente.

## 19. Backup inicial obligatorio

Después de una instalación ya configurada:

```bash
./scripts/ops/backup.sh
```

Verifica el gzip:

```bash
gzip -t backups/postgres_qlik_automatizaciones_*.sql.gz
```

Respalda además, fuera del servidor:

- `.env` cifrado/protegido;
- credenciales/config del Cloudflare Tunnel;
- `compose.override.yaml` local, si existe;
- commit desplegado;
- instrucciones de acceso al bucket/proyecto externo, sin copiar secretos a Git.

Un backup que solo existe en el mismo disco del servidor no es un plan de recuperación.

Consulta [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## 20. Prueba de restauración

Un backup no se considera confiable hasta que se ha probado una restauración en un PostgreSQL aislado.

Haz el ensayo en un contenedor/proyecto Compose temporal, no destruyendo producción. Verifica al menos:

- el dump descomprime;
- PostgreSQL acepta todo el SQL con `ON_ERROR_STOP`;
- existen las tablas esperadas;
- existen organización/usuarios/tenants esperados;
- la aplicación puede descifrar sus secretos usando la clave respaldada.

Documenta fecha del último restore drill.

## 21. Actualización normal de producción

### 21.1 Antes

```bash
cd /opt/qlik-reportes-creator
git status --short --branch
./scripts/ops/backup.sh
git fetch origin main
git log --oneline HEAD..origin/main
```

Conserva el commit actual:

```bash
git rev-parse HEAD
```

### 21.2 Validar código antes del cutover

En CI o en una máquina con Bun:

```bash
bun install --frozen-lockfile
bun run verify
./scripts/ops/release-check.sh
git diff --check
```

En el servidor, como mínimo:

```bash
git pull --ff-only origin main
docker compose config --quiet
docker compose build
```

El build se puede hacer mientras la versión anterior sigue sirviendo tráfico.

### 21.3 Cutover

```bash
docker compose up -d
docker compose ps -a
```

No uses `docker compose down -v`.

### 21.4 Validar

```bash
HOST=127.0.0.1 PORT_WEB=4524 ./scripts/ops/smoke.sh
curl -fsS https://reportes.ejemplo.com/api/ready
docker compose logs api --since=5m
```

Haz también un login OAuth nuevo y una operación funcional representativa si el release tocó autenticación, Qlik, BigQuery, descargas o migraciones.

## 22. Rollback de aplicación

El proyecto construye imágenes desde Git; no existe un registry versionado que haga rollback por `docker compose pull`.

```bash
CURRENT_TAG=<tag-o-commit> ./scripts/ops/rollback.sh
```

El script:

1. rechaza cambios tracked locales;
2. resuelve el commit/tag;
3. respalda PostgreSQL;
4. cambia a un checkout detached;
5. reconstruye `migrate`, `api`, `web`;
6. levanta Compose;
7. ejecuta smoke tests.

**La base de datos no vuelve atrás automáticamente.** Las migraciones son forward-only. Si la versión anterior no soporta el esquema actual, restaura explícitamente un backup compatible.

Consulta [ROLLBACK.md](ROLLBACK.md).

## 23. Restore de producción

El restore es destructivo sobre la DB destino. Primero detén consumidores:

```bash
docker compose stop api web
./scripts/ops/restore.sh ./backups/postgres_qlik_automatizaciones_FECHA.sql.gz
docker compose up -d
HOST=127.0.0.1 PORT_WEB=4524 ./scripts/ops/smoke.sh
```

Después prueba el dominio público, OAuth y descifrado de configuración.

## 24. Persistencia y reinicio del host

Después de la primera instalación, comprueba que los servicios esenciales están habilitados:

```bash
systemctl is-enabled docker
systemctl is-active docker
systemctl is-enabled cloudflared
systemctl is-active cloudflared
```

`postgres`, `api` y `web` usan `restart: unless-stopped`, pero dependen de Docker arrancando al boot.

Durante una ventana controlada, es recomendable validar al menos una vez un reboot completo del host:

```bash
sudo reboot
```

Después del regreso:

```bash
docker compose ps -a
systemctl is-active cloudflared
curl -fsS https://reportes.ejemplo.com/api/ready
```

## 25. Logs y observabilidad real

La API emite JSON estructurado a stdout/stderr; Nginx también escribe a los logs del contenedor.

```bash
docker compose logs api --tail=200
docker compose logs web --tail=200
docker compose logs migrate --tail=200
docker compose logs postgres --tail=100
```

El proyecto **no expone actualmente un endpoint Prometheus `/metrics`**. No configures alertas basadas en métricas inexistentes.

Para monitoreo externo, empieza por:

- HTTPS `GET /api/live`;
- HTTPS `GET /api/ready`;
- espacio en disco;
- estado Docker;
- estado `cloudflared`;
- edad del último backup;
- errores `5xx` en logs.

Consulta [OBSERVABILIDAD.md](OBSERVABILIDAD.md).

## 26. Seguridad final

Comprueba:

```bash
stat -c '%a %n' .env
ss -lntp
./scripts/ops/secret-scan.sh
```

Criterios:

- `.env` = `600`.
- DB no expuesta públicamente.
- web enlazado a loopback salvo Tailscale explícito.
- fallback de Cloudflare = `http_status:404`.
- ningún JSON de Service Account está en Git.
- ningún OAuth Client Secret está en Git.
- no hay backups dentro de directorios públicos.
- no hay logs copiando tokens/códigos OAuth innecesariamente.

## 27. Comandos destructivos

Estos comandos eliminan datos persistentes:

```bash
docker compose down -v
docker volume rm qlik_reportes_creator_postgres_data
sudo rm -rf /var/lib/docker
```

No los uses para actualizar, arreglar OAuth ni “limpiar” producción.

`docker compose down` sin `-v` elimina contenedores/redes pero conserva el volumen.

## 28. Diagnóstico rápido

```bash
docker compose ps -a
docker compose logs migrate --tail=150
docker compose logs api --tail=150
docker compose logs web --tail=150
docker compose logs postgres --tail=100
systemctl status cloudflared --no-pager
```

Problemas frecuentes:

| Síntoma | Revisar primero |
| --- | --- |
| `migrate` != `Exited (0)` | migración y PostgreSQL |
| `/api/ready` = 503 | PostgreSQL / `DATABASE_URL` interna |
| Nginx 502 | `api` no healthy / puerto interno 4523 |
| OAuth vuelve a localhost | `FRONTEND_URL` dentro de `api` + Redirect URI Qlik |
| `OAUTH_ESTADO_INVALIDO` | mismo origen, cookies state/PKCE, login nuevo |
| OAuth client invalid | Client ID/secret/redirect exacto |
| identidad Qlik falla | scopes `user_default` + identity scopes |
| BigQuery falla | service account, project/dataset, egress |
| GCS falla | bucket/prefijo/permisos del Service Account |
| público caído pero local funciona | `cloudflared`/DNS |
| tras reboot no vuelve | Docker/cloudflared no habilitados como servicio |

## 29. Configuración del servidor de referencia

El servidor validado el 31 de agosto de 2026 usa conceptualmente:

```text
COMPOSE_PROJECT_NAME=qlik_reportes_creator
FRONTEND_URL=https://apiqac.andresgaibor.com
HOST_IP=127.0.0.1
PORT_WEB=3847
PORT_API=4523
Cloudflare Tunnel → http://127.0.0.1:3847
```

En ese servidor existe además un override para bind por Tailscale.

**No copies sus secretos ni valores privados a este documento.**

## 30. Referencias oficiales externas

Las recetas de instalación de infraestructura deben contrastarse con sus fuentes oficiales antes de un rebuild mayor:

- Docker Engine: documentación oficial de instalación para Debian.
- Cloudflare Tunnel: documentación oficial de ejecución como servicio en Linux.
- Tailscale: documentación oficial de instalación para Linux.
- Qlik OAuth: documentación oficial de autenticación y scopes de Qlik Cloud.

Las versiones exactas cambian; evita congelar en este documento una versión de Docker/cloudflared como requisito si el proyecto no la necesita explícitamente.

# Cloudflare Tunnel en Debian

Complementa [LEVANTAR-DESDE-CERO.md](LEVANTAR-DESDE-CERO.md). La meta es que el dominio público dependa de un servicio systemd, no de una terminal abierta.

## 1. Instalar `cloudflared`

Usa el repositorio APT oficial de Cloudflare para Debian/Ubuntu:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install -y cloudflared
cloudflared --version
```

## 2. Crear un túnel administrado localmente

Solo si todavía no existe:

```bash
cloudflared tunnel login
cloudflared tunnel create qlik-reportes
```

El comando crea credenciales en `~/.cloudflared/`. Protégelas y respáldalas fuera del host.

## 3. Configurar ingress

Ejemplo `~/.cloudflared/config.yml`:

```yaml
tunnel: qlik-reportes
credentials-file: /home/USUARIO/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: reportes.ejemplo.com
    service: http://127.0.0.1:4524
  - service: http_status:404
```

Reglas:

- El `hostname` debe coincidir con `FRONTEND_URL`.
- El puerto debe coincidir con `PORT_WEB`.
- Usa `127.0.0.1`, no la IP pública.
- El último ingress debe responder `http_status:404`; no reenvíes hostnames desconocidos al frontend.

Asocia DNS si administras el túnel por CLI:

```bash
cloudflared tunnel route dns qlik-reportes reportes.ejemplo.com
```

## 4. Instalar como servicio systemd

Cuando la configuración vive en el home del usuario, pasa la ruta explícita para evitar que `sudo` busque en `/root/.cloudflared`:

```bash
sudo cloudflared --config /home/USUARIO/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
```

Verifica:

```bash
systemctl is-enabled cloudflared
systemctl is-active cloudflared
sudo systemctl status cloudflared --no-pager
journalctl -u cloudflared --since '10 min ago' --no-pager
```

Después de modificar `config.yml`:

```bash
sudo systemctl restart cloudflared
```

No dejes simultáneamente un `cloudflared tunnel run ...` manual y el servicio systemd: evita dos procesos administrados de formas distintas.

## 5. Prueba pública

```bash
curl -fsS https://reportes.ejemplo.com/api/ready
curl -fsS https://reportes.ejemplo.com/api/setup/status
```

## 6. Verificación después de reboot

En una ventana controlada valida que el túnel vuelva solo:

```bash
sudo reboot
```

Después:

```bash
systemctl is-active cloudflared
curl -fsS https://reportes.ejemplo.com/api/ready
```

Si localmente `127.0.0.1:PORT_WEB` responde pero el dominio no, revisa primero `cloudflared`, DNS y el ingress.

## Referencia oficial

Esta receta se contrastó el 31 de agosto de 2026 con la documentación oficial de Cloudflare para instalación APT de `cloudflared` y ejecución como servicio Linux. Revalida la documentación oficial antes de reconstruir un servidor mucho tiempo después.

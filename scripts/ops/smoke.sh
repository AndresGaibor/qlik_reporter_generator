#!/usr/bin/env bash
# smoke.sh - Smoke tests para validar el despliegue
set -euo pipefail

HOST="${HOST:-localhost}"
PORT_WEB="${PORT_WEB:-4524}"
PORT_API="${PORT_API:-4523}"
TIMEOUT=30

ERRORS=0

echo "=============================================="
echo " Qlik Automate Creator - Smoke Tests"
echo "=============================================="
echo ""

wait_for_service() {
  local host=$1
  local port=$2
  local name=$3
  local max_wait=${TIMEOUT}
  local waited=0

  echo "Esperando $name en $host:$port..."
  while ! nc -z -w 2 "$host" "$port" 2>/dev/null; do
    if [ $waited -ge $max_wait ]; then
      echo "  ERROR: $name no disponible despues de ${max_wait}s"
      return 1
    fi
    sleep 2
    waited=$((waited+2))
  done
  echo "  OK: $name disponible"
}

# 1. Verificar que los puertos estan escuchando
echo "[1/5] Verificando servicios de red..."
if command -v nc &> /dev/null; then
  wait_for_service "$HOST" "$PORT_WEB" "Web (nginx)" || ERRORS=$((ERRORS+1))
else
  echo "  SKIP: nc no disponible"
fi

# 2. Verificar web (nginx)
echo "[2/5] Verificando frontend..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${HOST}:${PORT_WEB}/" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  OK: Frontend responde (HTTP $HTTP_CODE)"
else
  echo "  ERROR: Frontend no responde (HTTP $HTTP_CODE)"
  ERRORS=$((ERRORS+1))
fi

# 3. Verificar API liveness
echo "[3/5] Verificando liveness..."
LIVENESS=$(curl -s --max-time 10 "http://${HOST}:${PORT_WEB}/api/live" 2>/dev/null || echo "{}")
if echo "$LIVENESS" | grep -q '"estado":"ok"'; then
  echo "  OK: Liveness OK"
else
  echo "  ERROR: Liveness fallido: $LIVENESS"
  ERRORS=$((ERRORS+1))
fi

# 4. Verificar API readiness
echo "[4/5] Verificando readiness..."
READY=$(curl -s --max-time 10 "http://${HOST}:${PORT_WEB}/api/ready" 2>/dev/null || echo "{}")
if echo "$READY" | grep -q '"estado":"ok"'; then
  echo "  OK: Readiness OK"
else
  echo "  ERROR: Readiness fallido: $READY"
  ERRORS=$((ERRORS+1))
fi

# 5. Verificar que /api/salud funciona
echo "[5/5] Verificando salud..."
SALUD=$(curl -s --max-time 10 "http://${HOST}:${PORT_WEB}/api/salud" 2>/dev/null || echo "{}")
if echo "$SALUD" | grep -q '"estado":"ok"'; then
  echo "  OK: Salud OK"
else
  echo "  ERROR: Salud fallido: $SALUD"
  ERRORS=$((ERRORS+1))
fi

echo ""
echo "=============================================="
if [ $ERRORS -eq 0 ]; then
  echo " SMOKE TESTS: PASSED"
  echo "=============================================="
  exit 0
else
  echo " SMOKE TESTS: FAILED ($ERRORS errores)"
  echo "=============================================="
  exit 1
fi

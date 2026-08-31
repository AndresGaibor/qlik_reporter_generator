#!/usr/bin/env bash
# release-check.sh - Verificaciones pre-release
set -euo pipefail

ERRORS=0

echo "=============================================="
echo " Qlik Automate Creator - Release Check"
echo "=============================================="
echo ""

# 1. Verificar que no hay archivos .env en el repo
echo "[1/7] Verificando archivos .env..."
if git ls-files --others --exclude-standard | grep -q "\.env"; then
  echo "  ERROR: Archivos .env sin commit detectados"
  git ls-files --others --exclude-standard | grep "\.env"
  ERRORS=$((ERRORS+1))
else
  echo "  OK: No hay archivos .env sin commit"
fi

# 2. Verificar que .env.example existe
echo "[2/7] Verificando .env.example..."
if [ -f .env.example ]; then
  echo "  OK: .env.example existe"
else
  echo "  ERROR: .env.example no encontrado"
  ERRORS=$((ERRORS+1))
fi

# 3. Verificar que compose.yaml tiene red interna
echo "[3/7] Verificando configuracion de red..."
if grep -q "internal: true" compose.yaml; then
  echo "  OK: Red interna configurada"
else
  echo "  ERROR: compose.yaml no tiene red interna (internal: true)"
  ERRORS=$((ERRORS+1))
fi

# 4. Verificar healthchecks
echo "[4/7] Verificando healthchecks..."
if grep -q "healthcheck:" compose.yaml; then
  echo "  OK: Healthchecks definidos"
else
  echo "  ERROR: No se encontraron healthchecks en compose.yaml"
  ERRORS=$((ERRORS+1))
fi

# 5. Verificar que migrate service existe
echo "[5/7] Verificando servicio migrate..."
if grep -q "migrate:" compose.yaml; then
  echo "  OK: Servicio migrate definido"
else
  echo "  ERROR: Servicio migrate no encontrado en compose.yaml"
  ERRORS=$((ERRORS+1))
fi

# 6. Verificar endpoints de salud
echo "[6/7] Verificando endpoints de salud..."
if grep -q "/api/live" apps/api/src/app.ts && grep -q "/api/ready" apps/api/src/app.ts; then
  echo "  OK: Endpoints /api/live y /api/ready definidos"
else
  echo "  ERROR: Endpoints de salud incompletos"
  ERRORS=$((ERRORS+1))
fi

# 7. Verificar lint pasa
echo "[7/7] Verificando lint..."
if command -v bun &> /dev/null; then
  if bun run lint 2>&1 | tee /tmp/lint_output.txt; then
    echo "  OK: Lint passed"
  else
    echo "  ERROR: Lint fallido"
    ERRORS=$((ERRORS+1))
  fi
else
  echo "  SKIP: bun no disponible"
fi

echo ""
echo "=============================================="
if [ $ERRORS -eq 0 ]; then
  echo " RELEASE CHECK: PASSED"
  echo "=============================================="
  exit 0
else
  echo " RELEASE CHECK: FAILED ($ERRORS errores)"
  echo "=============================================="
  exit 1
fi

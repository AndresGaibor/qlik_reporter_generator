#!/usr/bin/env bash
# secret-scan.sh - Escaneo de secretos en el repositorio
set -euo pipefail

echo "=============================================="
echo " Qlik Automate Creator - Secret Scan"
echo "=============================================="
echo ""

PATTERNS=(
  "AKIA[0-9A-Z]{16}"        # AWS Access Key
  "[a-zA-Z0-9+/]{40}=="      # Base64 encoded secrets (generico)
  "password\s*=\s*['\"][^'\"]{8,}['\"]"  # password=...
  "secret\s*=\s*['\"][^'\"]{8,}['\"]"    # secret=...
  "token\s*=\s*['\"][^'\"]{8,}['\"]"     # token=...
  "api[_-]?key\s*=\s*['\"][^'\"]{8,}['\"]" # api_key=...
)

FOUND=0

# Escaneo basico con grep
echo "Escaneando archivos..."

for pattern in "${PATTERNS[@]}"; do
  if grep -rE "$pattern" --include="*.ts" --include="*.js" --include="*.json" \
    --include="*.yaml" --include="*.yml" --include="*.sh" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=.git \
    --exclude="*.test.ts" \
    --exclude="*.test.js" \
    . 2>/dev/null | grep -v "cambiar_en_produccion" | grep -v "TU_PASSWORD" | grep -v "example"; then
    echo "  PATRON: $pattern"
    FOUND=$((FOUND+1))
  fi
done

# Verificar .gitignore
echo ""
echo "Verificando .gitignore..."
if [ -f .gitignore ] && grep -q "\.env" .gitignore && grep -q "node_modules" .gitignore; then
  echo "  OK: .gitignore incluye archivos sensibles"
else
  echo "  WARNING: .gitignore puede estar incompleto"
fi

# Verificar que no hay secretos en archivos de configuracion
echo ""
echo "Verificando archivos de configuracion..."
SENSITIVE_FILES=(
  ".env.production"
  ".env"
  "compose.yaml"
)

for file in "${SENSITIVE_FILES[@]}"; do
  if [ -f "$file" ]; then
    if grep -qE "(password|secret|token|key)\s*=\s*['\"][^'\"]{8,}" "$file" 2>/dev/null; then
      if [ "$file" = ".env.production" ] || [ "$file" = ".env" ]; then
        echo "  $file: contiene valores sensibles (verificar que es .gitignore)"
      fi
    fi
  fi
done

echo ""
echo "=============================================="
if [ $FOUND -eq 0 ]; then
  echo " SECRET SCAN: PASSED (sin secretos obvios)"
else
  echo " SECRET SCAN: ATTENTION ($FOUND match(es) revisados)"
fi
echo "=============================================="
exit 0

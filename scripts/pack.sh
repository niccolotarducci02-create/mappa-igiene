#!/usr/bin/env bash
# Crea mappa-igiene.zip con il codice sorgente (senza node_modules, build e dati locali).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/home/user/mappa-igiene.zip}"
rm -f "$OUT"
zip -qr "$OUT" . -x 'node_modules/*' 'dist/*' 'dist-artifact/*' '.git/*' 'test-results/*' 'playwright-report/*' '.env' '.env.local'
echo "creato $OUT ($(du -h "$OUT" | cut -f1))"

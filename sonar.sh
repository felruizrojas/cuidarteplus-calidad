#!/usr/bin/env bash
# Atajo para usar SonarQube local (Actividad 2).
#   ./sonar.sh up             enciende SonarQube en http://localhost:9000
#   ./sonar.sh scan           analiza backend y frontend
#   ./sonar.sh scan-backend   analiza solo el backend
#   ./sonar.sh scan-frontend  analiza solo el frontend
#   ./sonar.sh down           apaga SonarQube
# El token se lee desde .env.sonar (ver .env.sonar.example); ese archivo no se sube a GitHub.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.sonar ] && set -a && . ./.env.sonar && set +a

scan() {
  local carpeta="$1"
  if [ -z "${SONAR_TOKEN:-}" ]; then echo "Falta SONAR_TOKEN en .env.sonar" >&2; exit 1; fi
  docker run --rm --network cuidarteplus-sonar-net \
    -e SONAR_HOST_URL="http://cuidarteplus-sonarqube:9000" \
    -e SONAR_TOKEN="$SONAR_TOKEN" \
    -e SONAR_SCANNER_OPTS="-Xmx512m -Dsonar.javascript.node.maxspace=1024" \
    -v "$PWD/$carpeta:/usr/src" \
    sonarsource/sonar-scanner-cli:latest
}

case "${1:-}" in
  up)            docker compose -f docker-compose.sonar.yml up -d
                 echo "Esperando a SonarQube..."
                 until curl -s http://localhost:${PORT_SONARQUBE:-9000}/api/system/status | grep -q '"status":"UP"'; do sleep 5; done
                 echo "SonarQube listo en http://localhost:${PORT_SONARQUBE:-9000}" ;;
  scan)          scan BACKEND; scan FRONTEND ;;
  scan-backend)  scan BACKEND ;;
  scan-frontend) scan FRONTEND ;;
  down)          docker compose -f docker-compose.sonar.yml down ;;
  *)             sed -n '2,8p' "$0"; exit 1 ;;
esac

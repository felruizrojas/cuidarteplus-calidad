#!/usr/bin/env bash
# =====================================================================
#  Cuidarte+ · Ejecuta todas las pruebas y genera un reporte HTML por herramienta
#  en la carpeta reportes/ (índice: reportes/index.html).
#
#  Uso:  ./ejecutar-pruebas.sh            (todas las etapas)
#        ./ejecutar-pruebas.sh --rapido   (omite la carga de 200 usuarios de k6, CP-15)
#  Requisitos: Docker, Node.js 20+, Python 3 y la CLI gh (para CodeQL y Dependabot).
# =====================================================================
set -uo pipefail
cd "$(dirname "$0")"
RAIZ="$PWD"
R="$RAIZ/reportes"
G="python3 $RAIZ/scripts/reportes/generar_html.py"
REPO="${REPO:-felruizrojas/cuidarteplus-calidad}"
RAPIDO="${1:-}"
declare -a RESUMEN=()

# En Docker Desktop (Mac/Windows) los contenedores llegan al equipo por host.docker.internal; en Linux, por --network host
if [ "$(uname)" = "Linux" ]; then RED="--network host"; HOST="localhost"; else RED=""; HOST="host.docker.internal"; fi

etapa() { echo; echo "=================== $1 ==================="; }
registrar() { RESUMEN+=("$(printf '%-34s %s' "$1" "$2")"); }

mkdir -p "$R"/{gitleaks,hadolint,jest,sonarqube,codeql,dependabot,zap,k6}

etapa "1/9 Gitleaks: secretos en el historial"
docker run --rm -v "$RAIZ:/repo" -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0="*" \
  zricethezav/gitleaks:v8.21.2 git /repo --redact -v --report-format json --report-path /repo/reportes/gitleaks/gitleaks.json
registrar "Gitleaks" "exit $?"
$G gitleaks "$R/gitleaks/gitleaks.json" "$R/gitleaks/index.html"

etapa "2/9 Hadolint: Dockerfiles"
rc=0
for d in BACKEND FRONTEND; do
  docker run --rm -i hadolint/hadolint:v2.12.0 hadolint --format json - < "$d/Dockerfile" > "$R/hadolint/$d.json" || rc=1
done
registrar "Hadolint" "exit $rc"
$G hadolint "$R/hadolint/index.html" BACKEND/Dockerfile="$R/hadolint/BACKEND.json" FRONTEND/Dockerfile="$R/hadolint/FRONTEND.json"

etapa "3/9 Cuidarte+ desde cero con Docker Compose"
docker compose down -v >/dev/null 2>&1
docker compose up -d --build --wait >/dev/null 2>&1 || docker compose up -d --wait
for _ in $(seq 1 40); do
  curl -sf -X POST http://localhost:4445/autenticacion/login -H "Content-Type: application/json" \
    -d '{"nombre_usuario":"admin","password":"admin"}' >/dev/null && curl -sf http://localhost:3334 >/dev/null && break
  sleep 2
done
docker compose ps

etapa "4/9 Jest + Supertest: unitarias, integración y seguridad de la API"
(cd BACKEND && npm ci --ignore-scripts --silent && npm test -- --silent --json --outputFile=../reportes/jest/resultados.json)
registrar "Jest + Supertest" "exit $?"
rm -rf "$R/jest/cobertura" && cp -R BACKEND/coverage/lcov-report "$R/jest/cobertura"

etapa "5/9 SonarQube (local y Cloud)"
if curl -s http://localhost:9000/api/system/status | grep -q '"status":"UP"'; then
  ./sonar.sh scan-backend >/dev/null 2>&1; sleep 10
  set -a; . ./.env.sonar; set +a
  $G sonarqube "$R/sonarqube/local.html" --url http://localhost:9000 --proyecto cuidarteplus-backend --usuario admin --clave "$SONAR_ADMIN_PASSWORD" --titulo "SonarQube local · Cuidarte+ Backend"
  registrar "SonarQube local" "generado"
else
  registrar "SonarQube local" "omitido (encienda con ./sonar.sh up)"
fi
$G sonarqube "$R/sonarqube/cloud.html" --url https://sonarcloud.io --proyecto felruizrojas_cuidarteplus-calidad --titulo "SonarQube Cloud · Cuidarte+ (pipeline)" \
  && registrar "SonarQube Cloud" "generado"

etapa "6/9 OWASP ZAP: seguridad dinámica del sitio y de la API"
chmod 777 "$R/zap"
docker run --rm $RED -v "$R/zap:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "http://$HOST:3334" -r zap-web.html -J zap-web.json -I
registrar "OWASP ZAP (web)" "exit $?"
docker run --rm $RED -v "$R/zap:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t "http://$HOST:4445/openapi.json" -f openapi -O "http://$HOST:4445" -r zap-api.html -J zap-api.json -I
registrar "OWASP ZAP (API)" "exit $?"

etapa "7/9 Playwright + axe-core: sistema, aceptación, seguridad, usabilidad y resiliencia"
(cd pruebas-e2e && npm ci --ignore-scripts --silent && npx playwright install chromium firefox webkit >/dev/null && npx playwright test)
registrar "Playwright + axe-core" "exit $?"

etapa "8/9 k6: rendimiento (CP-06 y CP-15)"
for s in cp06-crud cp15-concurrencia; do
  [ "$s" = cp15-concurrencia ] && [ "$RAPIDO" = "--rapido" ] && { registrar "k6 $s" "omitido (--rapido)"; continue; }
  docker run --rm -i $RED -u "$(id -u):$(id -g)" -e BASE_URL="http://$HOST:4445" -e WEB_URL="http://$HOST:3334" \
    -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/resultados/$s.html" -e RESUMEN="/resultados/$s-resumen.json" \
    -v "$RAIZ/pruebas-rendimiento:/scripts" -v "$R/k6:/resultados" grafana/k6:1.3.0 run --quiet "/scripts/$s.js" | tee "$R/k6/$s.txt"
  registrar "k6 $s" "exit ${PIPESTATUS[0]}"
done

etapa "9/9 CodeQL y Dependabot (GitHub) + índice"
$G codeql "$R/codeql/index.html" --repo "$REPO" && registrar "CodeQL" "generado"
$G dependabot "$R/dependabot/index.html" --repo "$REPO" && registrar "Dependabot" "generado"
$G indice "$R"

etapa "Resumen"
printf '%s\n' "${RESUMEN[@]}"
echo "Índice de reportes: $R/index.html"

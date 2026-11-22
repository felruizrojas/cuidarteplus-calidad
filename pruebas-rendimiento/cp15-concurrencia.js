// CP-15 (parte concurrencia) · 200 usuarios concurrentes sin errores y p95 de la API < 300 ms (NFR-PERF-3)
// Herramienta: k6. 200 usuarios virtuales durante 30 s contra GET /pacientes y luego contra el frontend,
// sin pausas entre peticiones (cada usuario es una conexión concurrente permanente).
import http from "k6/http";
import { check } from "k6";

const API = __ENV.BASE_URL || "http://localhost:4445";
const WEB = __ENV.WEB_URL || "http://localhost:3334";
const DURACION = __ENV.DURACION || "30s";
const VUS = Number(__ENV.VUS || 200);
const s = parseInt(DURACION, 10);

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    api_pacientes: { executor: "constant-vus", vus: VUS, duration: DURACION, exec: "api", tags: { esc: "api" } },
    frontend: { executor: "constant-vus", vus: VUS, duration: DURACION, startTime: `${s + 3}s`, exec: "web", tags: { esc: "web" } },
  },
  thresholds: {
    "http_req_failed{esc:api}": ["rate<0.001"], // 200 conexiones sin errores
    "http_req_failed{esc:web}": ["rate<0.001"],
    "http_req_duration{esc:api}": ["p(95)<300"], // latencia de la API bajo 200 usuarios
  },
};

export function setup() {
  const r = http.post(`${API}/autenticacion/login`, JSON.stringify({ nombre_usuario: "medico", password: "medico" }), {
    headers: { "Content-Type": "application/json" },
  });
  return { token: r.json("token") };
}

export function api(d) {
  const r = http.get(`${API}/pacientes`, { headers: { Authorization: `Bearer ${d.token}` }, tags: { esc: "api" }, timeout: "10s" });
  check(r, { "GET /pacientes 200": (x) => x.status === 200 });
}

export function web() {
  const r = http.get(`${WEB}/login`, { tags: { esc: "web" }, timeout: "10s" });
  check(r, { "frontend 200": (x) => x.status === 200 });
}

export function handleSummary(data) {
  delete data.setup_data; // contiene el token de sesión de la cuenta ficticia: no se exporta
  const m = (k) => (data.metrics[k] ? data.metrics[k].values : {});
  const api = m("http_req_duration{esc:api}");
  const texto = [
    `CP-15 · ${VUS} usuarios concurrentes (k6)`,
    `  API GET /pacientes: p50=${(api.med || 0).toFixed(1)}ms p95=${(api["p(95)"] || 0).toFixed(1)}ms p99=${(api["p(99)"] || 0).toFixed(1)}ms · errores=${((m("http_req_failed{esc:api}").rate || 0) * 100).toFixed(2)}%`,
    `  Frontend /login:    errores=${((m("http_req_failed{esc:web}").rate || 0) * 100).toFixed(2)}%`,
    `  solicitudes totales: ${data.metrics.http_reqs.values.count} · ${data.metrics.http_reqs.values.rate.toFixed(1)} req/s`,
  ].join("\n");
  return { stdout: texto + "\n", [__ENV.RESUMEN || "/resultados/cp15-concurrencia-resumen.json"]: JSON.stringify(data, null, 2) };
}

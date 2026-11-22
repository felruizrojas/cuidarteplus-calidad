// CP-06 · Tiempo de respuesta CRUD < 300 ms bajo carga normal (NFR-PERF-1)
// Herramienta: k6. Cada operación CRUD se ejecuta con 10 usuarios virtuales durante 30 s (carga normal),
// una tras otra: listar pacientes, crear, leer, actualizar y eliminar exámenes.
// Reporte HTML: K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=<ruta>.html
import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4445";
const DURACION = __ENV.DURACION || "30s";
const VUS = Number(__ENV.VUS || 10);
const segundos = parseInt(DURACION, 10);

const OPERACIONES = ["listar_pacientes", "crear_examen", "leer_examen", "actualizar_examen", "eliminar_examen"];

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: Object.fromEntries(
    OPERACIONES.map((op, i) => [
      op,
      { executor: "constant-vus", vus: VUS, duration: DURACION, startTime: `${i * (segundos + 2)}s`, exec: op, tags: { op } },
    ])
  ),
  thresholds: {
    // NFR-PERF-1: percentil 95 menor a 300 ms en cada operación CRUD
    ...Object.fromEntries(OPERACIONES.map((op) => [`http_req_duration{op:${op},medida:si}`, ["p(95)<300"]])),
    // Sin errores HTTP 5xx ni timeouts bajo carga normal
    "http_req_failed{medida:si}": ["rate<0.01"],
  },
};

function login(usuario, clave) {
  const r = http.post(`${BASE_URL}/autenticacion/login`, JSON.stringify({ nombre_usuario: usuario, password: clave }), {
    headers: { "Content-Type": "application/json" },
  });
  return r.json("token");
}

export function setup() {
  const medico = login("medico", "medico");
  const admin = login("admin", "admin");
  const h = { headers: { Authorization: `Bearer ${medico}`, "Content-Type": "application/json" } };
  const examen = http.post(`${BASE_URL}/examenes`, JSON.stringify({ tipo_examen_medico_id: 1, paciente_id: 1, diagnosis: "Base CP-06" }), h);
  return { medico, admin, examenId: examen.json("id") };
}

const cabeceras = (t) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const medida = (op) => ({ headers: undefined, tags: { op, medida: "si" } });

export function listar_pacientes(d) {
  const r = http.get(`${BASE_URL}/pacientes`, { headers: cabeceras(d.medico), tags: medida("listar_pacientes").tags });
  check(r, { "listar pacientes 200": (x) => x.status === 200 });
}

export function crear_examen(d) {
  const r = http.post(`${BASE_URL}/examenes`, JSON.stringify({ tipo_examen_medico_id: 3, paciente_id: 1, diagnosis: "Carga CP-06" }), {
    headers: cabeceras(d.medico), tags: medida("crear_examen").tags,
  });
  check(r, { "crear examen 201": (x) => x.status === 201 });
}

export function leer_examen(d) {
  const r = http.get(`${BASE_URL}/examenes/${d.examenId}`, { headers: cabeceras(d.medico), tags: medida("leer_examen").tags });
  check(r, { "leer examen 200": (x) => x.status === 200 });
}

export function actualizar_examen(d) {
  const r = http.put(`${BASE_URL}/examenes/${d.examenId}`, JSON.stringify({ notas: `Actualizado ${Date.now()}` }), {
    headers: cabeceras(d.medico), tags: medida("actualizar_examen").tags,
  });
  check(r, { "actualizar examen 200": (x) => x.status === 200 });
}

export function eliminar_examen(d) {
  // Se crea un examen auxiliar (no se mide) y se mide solo su eliminación.
  // La eliminación la hace el administrador: hoy el médico no puede eliminar (INC-14).
  const aux = http.post(`${BASE_URL}/examenes`, JSON.stringify({ tipo_examen_medico_id: 3, paciente_id: 1, diagnosis: "Para eliminar" }), {
    headers: cabeceras(d.medico), tags: { op: "auxiliar", medida: "no" },
  });
  const r = http.del(`${BASE_URL}/examenes/${aux.json("id")}`, null, { headers: cabeceras(d.admin), tags: medida("eliminar_examen").tags });
  check(r, { "eliminar examen 200": (x) => x.status === 200 });
}

export function handleSummary(data) {
  delete data.setup_data; // contiene el token de sesión de la cuenta ficticia: no se exporta
  const filas = OPERACIONES.map((op) => {
    const m = data.metrics[`http_req_duration{op:${op},medida:si}`];
    const v = m ? m.values : {};
    const ok = m && m.thresholds ? Object.values(m.thresholds).every((t) => t.ok) : false;
    return `  ${op.padEnd(18)} prom=${(v.avg || 0).toFixed(2)}ms  p50=${(v.med || 0).toFixed(2)}ms  p95=${(v["p(95)"] || 0).toFixed(2)}ms  máx=${(v.max || 0).toFixed(2)}ms  ${ok ? "✓ cumple" : "✗ no cumple"} (p95 < 300 ms)`;
  });
  const fallas = data.metrics["http_req_failed{medida:si}"];
  const texto = [
    "CP-06 · Tiempo de respuesta CRUD (k6, 10 usuarios virtuales x 30 s por operación)",
    ...filas,
    `  errores HTTP: ${((fallas ? fallas.values.rate : 0) * 100).toFixed(2)} %   solicitudes totales: ${data.metrics.http_reqs.values.count}`,
  ].join("\n");
  return { stdout: texto + "\n", [__ENV.RESUMEN || "/resultados/cp06-crud-resumen.json"]: JSON.stringify(data, null, 2) };
}

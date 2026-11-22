// PRUEBA DE RENDIMIENTO DE CUIDARTE+ (NFR-PERF)
// Perfil "humo": pocas personas, rápido, para el pipeline.
// Perfil "carga": hasta 200 personas a la vez, como pide el ERS (NFR-PERF-3).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4445";
const PERFIL = __ENV.PERFIL || "humo";

const perfiles = {
  humo: [
    { duration: "10s", target: 5 },
    { duration: "20s", target: 5 },
    { duration: "5s", target: 0 },
  ],
  carga: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 200 },
    { duration: "1m", target: 200 },
    { duration: "30s", target: 0 },
  ],
};

export const options = {
  stages: perfiles[PERFIL],
  thresholds: {
    // NFR-PERF-1: operaciones CRUD simples bajo 300 ms (95 % de las peticiones)
    http_req_duration: ["p(95)<300"],
    // NFR-PERF-3: sin errores con los usuarios concurrentes (menos de 1 %)
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

// Se ejecuta una sola vez al inicio: el médico inicia sesión y comparte el token
export function setup() {
  const res = http.post(
    `${BASE_URL}/autenticacion/login`,
    JSON.stringify({ nombre_usuario: "medico", password: "medico" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, { "login correcto": (r) => r.status === 200 });
  return { token: res.json("token") };
}

// Lo que hace cada "persona virtual", una y otra vez (flujo NFR-USAB-4)
export default function (datos) {
  const params = { headers: { Authorization: `Bearer ${datos.token}` } };

  const pacientes = http.get(`${BASE_URL}/pacientes`, params);
  check(pacientes, { "listar pacientes responde 200": (r) => r.status === 200 });

  const paciente = http.get(`${BASE_URL}/pacientes/1`, params);
  check(paciente, { "ver ficha del paciente responde 200": (r) => r.status === 200 });

  const examenes = http.get(`${BASE_URL}/examenes/paciente/1`, params);
  check(examenes, { "listar exámenes del paciente responde 200": (r) => r.status === 200 });

  sleep(1);
}

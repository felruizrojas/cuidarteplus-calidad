// CP-23 · Gestión segura de logs y mensajes de error (NFR-SEG-6)
// Herramienta: Jest + Supertest. El log del servidor se observa con un espía sobre console.error.
const { pool } = require("../../src/db");
const { app, request, auth, iniciarSesion } = require("../apoyo");

const INTERNO = /invalid input syntax|violates foreign key|constraint|relation "|bigint|column|postgres/i;
let token, resMalFormada, resIntegridad, logs;

beforeAll(async () => {
  token = await iniciarSesion("medico", "medico");
  const espia = jest.spyOn(console, "error").mockImplementation(() => {});
  resMalFormada = await request(app).get("/examenes/abc").set(auth(token));
  resIntegridad = await request(app).post("/examenes").set(auth(token)).send({ tipo_examen_medico_id: 1, paciente_id: 999999 });
  logs = espia.mock.calls.map((c) => c.map((x) => (x && x.stack) || String(x)).join(" ")).join("\n");
  espia.mockRestore();
});
afterAll(() => pool.end());

describe("CP-23 · Gestión segura de logs y mensajes de error", () => {
  test.failing("CP-23 V01 · La entrada mal formada (GET /examenes/abc) devuelve 400 genérico (INC-32)", () => {
    expect(resMalFormada.status).toBe(400);
  });

  test.failing("CP-23 V02 · El error de integridad (paciente inexistente) devuelve 400/404 sin nombres internos (INC-32)", () => {
    expect([400, 404]).toContain(resIntegridad.status);
    expect(JSON.stringify(resIntegridad.body)).not.toMatch(INTERNO);
  });

  test.failing("CP-23 V03 · Ninguna respuesta incluye mensajes internos de PostgreSQL (INC-32)", () => {
    expect(JSON.stringify(resMalFormada.body) + JSON.stringify(resIntegridad.body)).not.toMatch(INTERNO);
  });

  test("CP-23 V04 · El log del servidor registra el detalle de cada error", () => {
    expect(logs).toMatch(INTERNO);
  });

  test("CP-23 V05 · El log no contiene contraseñas ni tokens", () => {
    expect(logs).not.toContain(token);
    expect(logs).not.toMatch(/password|contrasena|Bearer /i);
  });
});

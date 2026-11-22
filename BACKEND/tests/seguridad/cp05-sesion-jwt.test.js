// CP-05 · Sesión JWT, logout y revocación (NFR-SEG-9, RF-1.2)
// Herramienta: Jest + Supertest.
const { pool } = require("../../src/db");
const { app, request, auth, iniciarSesion } = require("../apoyo");

let token;
beforeAll(async () => {
  token = await iniciarSesion("medico", "medico");
});
afterAll(() => pool.end());

const decodificar = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

describe("CP-05 · Sesión JWT, logout y revocación", () => {
  test("CP-05 V01 · El token válido da acceso a un endpoint protegido (200)", async () => {
    const res = await request(app).get("/pacientes").set(auth(token));
    expect(res.status).toBe(200);
  });

  test.failing("CP-05 V02 · La vigencia del token es corta (≤ 15 minutos) (INC-18)", () => {
    const { iat, exp } = decodificar(token);
    expect((exp - iat) / 60).toBeLessThanOrEqual(15);
  });

  test.failing("CP-05 V03 · Existe el endpoint de cierre de sesión (logout) (INC-18)", async () => {
    const res = await request(app).post("/autenticacion/logout").set(auth(token));
    expect(res.status).not.toBe(404);
  });

  test.failing("CP-05 V04 · Existe el endpoint de renovación (refresh) (INC-18)", async () => {
    const res = await request(app).post("/autenticacion/refresh").set(auth(token));
    expect(res.status).not.toBe(404);
  });

  test.failing("CP-05 V05 · Tras el logout el token se rechaza (401) (INC-18)", async () => {
    await request(app).post("/autenticacion/logout").set(auth(token));
    const res = await request(app).get("/pacientes").set(auth(token));
    expect(res.status).toBe(401);
  });

  test("CP-05 V06 · Sin token la petición se rechaza (401)", async () => {
    const res = await request(app).get("/pacientes");
    expect(res.status).toBe(401);
  });

  test("CP-05 V07 · Con un token inválido la petición se rechaza (401)", async () => {
    const res = await request(app).get("/pacientes").set(auth(token.slice(0, -4) + "abcd"));
    expect(res.status).toBe(401);
  });
});

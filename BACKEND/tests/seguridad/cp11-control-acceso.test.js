// CP-11 · Control de acceso por rol en el backend (NFR-SEG-4, RB-1, RB-3)
// Herramienta: Jest + Supertest.
const { pool } = require("../../src/db");
const { app, request, auth, sufijo, iniciarSesion, crearUsuario } = require("../apoyo");

let tokenAdmin, tokenPaciente;
beforeAll(async () => {
  tokenAdmin = await iniciarSesion("admin", "admin");
  tokenPaciente = await iniciarSesion("paciente", "paciente");
});
afterAll(() => pool.end());

describe("CP-11 · El paciente solo tiene lectura de su propia información (RB-1)", () => {
  test("CP-11 V01 · El paciente no puede listar pacientes (403)", async () => {
    expect((await request(app).get("/pacientes").set(auth(tokenPaciente))).status).toBe(403);
  });
  test("CP-11 V02 · El paciente no puede ver la ficha de otro paciente (403)", async () => {
    expect((await request(app).get("/pacientes/2").set(auth(tokenPaciente))).status).toBe(403);
  });
  test("CP-11 V03 · El paciente no puede ver los exámenes de otro paciente (403)", async () => {
    expect((await request(app).get("/examenes/paciente/2").set(auth(tokenPaciente))).status).toBe(403);
  });
  test.failing("CP-11 V04 · El paciente no puede modificar su propia ficha clínica (403) (INC-25)", async () => {
    const res = await request(app).put("/pacientes/1").set(auth(tokenPaciente)).send({ alergias: "Ninguna" });
    expect(res.status).toBe(403);
  });
});

describe("CP-11 · Escalamiento de privilegios y operaciones sin autenticación", () => {
  test("CP-11 V05 · El paciente no puede crear un usuario administrador (403) — corregido DEF-02", async () => {
    const id = sufijo();
    const res = await request(app).post("/usuarios").set(auth(tokenPaciente))
      .send({ nombre_usuario: `intruso${id}`, contrasena_hash: "Intruso2026!#", correo: `intruso${id}@correo.cl`, rol_id: 1 });
    expect(res.status).toBe(403);
  });
  test("CP-11 V06 · DELETE /usuarios sin token se rechaza (401) — corregido DEF-01", async () => {
    const victima = await crearUsuario(tokenAdmin, 3);
    expect((await request(app).delete(`/usuarios/${victima.id}`)).status).toBe(401);
  });
  test.failing("CP-11 V07 · POST /roles sin token se rechaza (401) (INC-24)", async () => {
    const res = await request(app).post("/roles").send({ nombre: `rol_qa_${sufijo()}` });
    expect(res.status).toBe(401);
  });
  test.failing("CP-11 V08 · GET /tipo-examen sin token se rechaza (401) (INC-26)", async () => {
    expect((await request(app).get("/tipo-examen")).status).toBe(401);
  });
  test.failing("CP-11 V09 · El médico no puede cambiar su propio rol a administrador (403) (INC-23)", async () => {
    const medico = await crearUsuario(tokenAdmin, 2);
    const tokenMedico = await iniciarSesion(medico.nombre_usuario, medico.clave);
    const res = await request(app).put(`/usuarios/${medico.id}`).set(auth(tokenMedico)).send({ correo: medico.correo, rol_id: 1 });
    expect(res.status).toBe(403);
  });
  test("CP-11 V10 · El médico puede ver la ficha de cualquier paciente (200) (RB-3)", async () => {
    const tokenMedico = await iniciarSesion("medico", "medico");
    expect((await request(app).get("/pacientes/2").set(auth(tokenMedico))).status).toBe(200);
  });
});

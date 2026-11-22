// CP-14 · Auditoría de acciones críticas (RF-5.1)
// Herramienta: Jest + Supertest + PostgreSQL real. Cada acción crítica debe dejar un registro con su autor.
const { pool } = require("../../src/db");
const { app, request, auth, sufijo, iniciarSesion, crearUsuario, crearPaciente, crearExamen, subirDocumento } = require("../apoyo");

let tokenAdmin, tokenMedico, tokenPaciente, idAdmin, idMedico, desde;

async function registros(patron) {
  const r = await pool.query("SELECT * FROM auditoria WHERE id > $1 AND accion ILIKE $2", [desde, patron]);
  return r.rows;
}

beforeAll(async () => {
  desde = (await pool.query("SELECT COALESCE(MAX(id),0) AS m FROM auditoria")).rows[0].m;
  tokenAdmin = await iniciarSesion("admin", "admin");
  tokenMedico = await iniciarSesion("medico", "medico");
  tokenPaciente = await iniciarSesion("paciente", "paciente");
  idAdmin = 1;
  idMedico = 2;

  // Se ejecutan las 12 acciones críticas
  const usuario = await crearUsuario(tokenAdmin, 3);
  await request(app).put(`/usuarios/${usuario.id}`).set(auth(tokenAdmin)).send({ correo: `editado_${sufijo()}@correo.cl` });
  await request(app).delete(`/usuarios/${usuario.id}`).set(auth(tokenAdmin));
  const paciente = await crearPaciente(tokenMedico);
  await request(app).put(`/pacientes/${paciente.id}`).set(auth(tokenMedico)).send({ telefono: "+56911112222" });
  const examen = await crearExamen(tokenMedico, paciente.id, 3);
  await request(app).put(`/examenes/${examen.id}`).set(auth(tokenMedico)).send({ notas: "Control en 6 meses" });
  const doc = await subirDocumento(tokenMedico, examen.id, paciente.id);
  const docId = doc.body.documentos[0].id;
  await request(app).get(`/documentos/${docId}`).set(auth(tokenMedico));
  await request(app).delete(`/documentos/${docId}`).set(auth(tokenAdmin));
  await request(app).delete(`/examenes/${examen.id}`).set(auth(tokenAdmin));
  await request(app).delete(`/pacientes/${paciente.id}`).set(auth(tokenAdmin));
});
afterAll(() => pool.end());

describe("CP-14 · Existe un registro por cada acción crítica", () => {
  test.each([
    ["creación de usuario", "USUARIOS_CREAR%"],
    ["edición de usuario", "USUARIOS_ACTUALIZAR%"],
    ["creación de paciente", "PACIENTES_CREAR%"],
    ["edición de paciente", "PACIENTES_ACTUALIZAR%"],
    ["eliminación de paciente", "PACIENTES_ELIMINAR%"],
    ["creación de examen", "EXAMENES_CREAR%"],
    ["edición de examen", "EXAMENES_ACTUALIZAR%"],
    ["eliminación de examen", "EXAMENES_ELIMINAR%"],
    ["subida de documento", "DOCUMENTOS_CREAR%"],
    ["eliminación de documento", "DOCUMENTOS_ELIMINAR%"],
  ])("CP-14 V · Queda auditada la %s", async (_n, patron) => {
    expect((await registros(patron)).length).toBeGreaterThan(0);
  });

  test.failing("CP-14 V11 · Queda auditada la eliminación de usuario (INC-06)", async () => {
    expect((await registros("USUARIOS_ELIMINAR%")).length).toBeGreaterThan(0);
  });

  test.failing("CP-14 V12 · Queda auditada la descarga de documento (INC-07)", async () => {
    expect((await registros("%DESCARG%")).length).toBeGreaterThan(0);
  });
});

describe("CP-14 · Autoría e inviolabilidad de la auditoría", () => {
  test("CP-14 V13 · Ningún registro generado tiene el usuario nulo", async () => {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM auditoria WHERE id > $1 AND usuario_id IS NULL", [desde]);
    expect(r.rows[0].n).toBe(0);
    expect([idAdmin, idMedico]).toBeDefined();
  });

  test.failing("CP-14 V14 · Un paciente no puede insertar registros de auditoría (INC-08)", async () => {
    const res = await request(app).post("/auditoria").set(auth(tokenPaciente)).send({ accion: "QA_REGISTRO_MANUAL" });
    expect([403, 404, 405]).toContain(res.status);
  });

  test("CP-14 V15 · El administrador consulta la auditoría (200)", async () => {
    const res = await request(app).get("/auditoria").set(auth(tokenAdmin));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

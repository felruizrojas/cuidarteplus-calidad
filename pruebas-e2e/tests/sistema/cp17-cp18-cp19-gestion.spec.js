// PRUEBAS DE SISTEMA: CP-17 (editar y visualizar paciente), CP-18 (usuarios y roles) y CP-19 (registrar examen).
const { test, expect } = require("@playwright/test");
const { nuevaApi, token, auth, sufijo, crearPaciente, crearExamen, psql, CLAVE_QA, TIPO } = require("../apoyo");

let api, tAdmin, tMedico, tPaciente;
test.beforeAll(async () => {
  api = await nuevaApi();
  tAdmin = await token(api, "admin", "admin");
  tMedico = await token(api, "medico", "medico");
  tPaciente = await token(api, "paciente", "paciente");
});

test.describe.serial("CP-17 · Editar y visualizar paciente (RF-2.3, RF-2.4)", () => {
  let paciente;
  test.beforeAll(async () => { paciente = await crearPaciente(api, tMedico, { primer_nombre: "Ana", apellido_paterno: "Rojas", apellido_materno: "Díaz" }); });

  test("CP-17 V01 · El médico edita el teléfono (200) y el dato queda actualizado", async () => {
    const r = await api.put(`/pacientes/${paciente.id}`, { headers: auth(tMedico), data: { telefono: "+56911112222" } });
    expect(r.status()).toBe(200);
    expect(psql(`SELECT telefono FROM pacientes WHERE id = ${paciente.id}`)).toBe("+56911112222");
  });
  test("CP-17 V02 · El administrador edita la dirección (200) y el dato queda actualizado", async () => {
    const r = await api.put(`/pacientes/${paciente.id}`, { headers: auth(tAdmin), data: { direccion: "Calle Ficticia 123" } });
    expect(r.status()).toBe(200);
    expect(psql(`SELECT direccion FROM pacientes WHERE id = ${paciente.id}`)).toBe("Calle Ficticia 123");
  });
  test("CP-17 V03 · El médico visualiza el registro con sus datos (200)", async () => {
    const r = await api.get(`/pacientes/${paciente.id}`, { headers: auth(tMedico) });
    expect(r.status()).toBe(200);
    expect((await r.json()).telefono).toBe("+56911112222");
  });
  test("CP-17 V04 · La edición con fecha de nacimiento futura se rechaza (400)", async () => {
    const r = await api.put(`/pacientes/${paciente.id}`, { headers: auth(tMedico), data: { fecha_nacimiento: "2099-01-01" } });
    expect(r.status()).toBe(400);
  });
  test("CP-17 V05 · Cada edición queda registrada en la auditoría", async () => {
    const logs = await (await api.get("/auditoria", { headers: auth(tAdmin) })).json();
    const ediciones = logs.filter((l) => l.accion.startsWith("PACIENTES_ACTUALIZAR") && l.accion.includes(String(paciente.id)));
    expect(ediciones.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe.serial("CP-18 · Administración de usuarios y roles (RF-2.5, RF-2.6, RF-2.7, RB-2)", () => {
  let usuario;
  test("CP-18 V01 · El administrador lista los usuarios (200)", async () => {
    expect((await api.get("/usuarios", { headers: auth(tAdmin) })).status()).toBe(200);
  });
  test("CP-18 V02 · El médico no lista usuarios (403)", async () => {
    expect((await api.get("/usuarios", { headers: auth(tMedico) })).status()).toBe(403);
  });
  test("CP-18 V03 · El administrador crea un usuario paciente y cambia su rol a médico (200)", async () => {
    const id = sufijo();
    const r = await api.post("/usuarios", { headers: auth(tAdmin), data: { nombre_usuario: `qa_adm_${id}`, contrasena_hash: CLAVE_QA, correo: `qa_adm_${id}@correo.cl`, rol_id: 3 } });
    usuario = await r.json();
    const cambio = await api.put(`/usuarios/${usuario.id}`, { headers: auth(tAdmin), data: { correo: usuario.correo, rol_id: 2 } });
    expect(cambio.status()).toBe(200);
    expect((await cambio.json()).rol_nombre).toBe("medico");
  });
  test.fail("CP-18 V04 · La eliminación responde HTTP 200 (INC-13)", async () => {
    const r = await api.delete(`/usuarios/${usuario.id}`, { headers: auth(tAdmin) });
    expect(r.status()).toBe(200);
  });
  test.fail("CP-18 V05 · La eliminación es lógica: el registro se conserva inactivo (INC-13)", async () => {
    expect(psql(`SELECT COUNT(*) FROM usuarios WHERE id = ${usuario.id}`)).toBe("1");
  });
  test.fail("CP-18 V06 · La eliminación queda registrada en la auditoría (INC-06)", async () => {
    const logs = await (await api.get("/auditoria", { headers: auth(tAdmin) })).json();
    expect(logs.some((l) => l.accion.startsWith("USUARIOS_ELIMINAR") && l.accion.includes(String(usuario.id)))).toBe(true);
  });
});

test.describe("CP-19 · Registrar examen médico (RF-3.1)", () => {
  test("CP-19 V01 · El médico registra un examen para un paciente nuevo (201)", async () => {
    const paciente = await crearPaciente(api, tMedico);
    const r = await crearExamen(api, tMedico, paciente.id, TIPO.hemograma, "Control QA");
    expect(r.status).toBe(201);
  });
  test("CP-19 V02 · El examen queda asociado al paciente indicado (paciente semilla id 1)", async () => {
    const r = await crearExamen(api, tMedico, 1, TIPO.glicemia, "Control QA");
    expect(r.status).toBe(201);
    expect(psql(`SELECT paciente_id FROM examen_medico WHERE id = ${r.body.id}`)).toBe("1");
  });
  test("CP-19 V03 · El paciente no puede registrar exámenes (403)", async () => {
    const r = await crearExamen(api, tPaciente, 1);
    expect(r.status).toBe(403);
  });
});

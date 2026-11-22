// PRUEBAS DE SISTEMA (caja negra) sobre Cuidarte+ desplegado: CP-01, CP-02 y CP-16.
const { test, expect } = require("@playwright/test");
const { nuevaApi, token, auth, sufijo, rutValido, CLAVE_QA } = require("../apoyo");

let api;
test.beforeAll(async () => { api = await nuevaApi(); });

test.describe("CP-01 · Autenticación de usuario (RF-1.1)", () => {
  const login = (u, p) => api.post("/autenticacion/login", { data: { nombre_usuario: u, password: p } });

  test("CP-01 V01 · Credenciales válidas: HTTP 200 con un token JWT", async () => {
    const r = await login("medico", "medico");
    expect(r.status()).toBe(200);
    expect((await r.json()).token.split(".")).toHaveLength(3);
  });
  test("CP-01 V02 · Contraseña incorrecta: HTTP 401 sin token y con mensaje genérico", async () => {
    const r = await login("medico", "ClaveEquivocada123!");
    const b = await r.json();
    expect(r.status()).toBe(401);
    expect(b.token).toBeUndefined();
    expect(b.error).toBe("Credenciales inválidas");
  });
  test("CP-01 V03 · Usuario inexistente: mismo mensaje (sin enumeración de usuarios)", async () => {
    const r = await login("no_existe_qa", "Cualquiera123!");
    expect(r.status()).toBe(401);
    expect((await r.json()).error).toBe("Credenciales inválidas");
  });
  test("CP-01 V04 · Campos vacíos: HTTP 400 con error de validación por campo", async () => {
    const r = await login("", "");
    const campos = (await r.json()).detalles.map((d) => d.field);
    expect(r.status()).toBe(400);
    expect(campos).toEqual(expect.arrayContaining(["nombre_usuario", "password"]));
  });
});

test.describe.serial("CP-02 · Registrar paciente (RF-2.2)", () => {
  let tMedico, tAdmin, creado;
  test.beforeAll(async () => {
    tMedico = await token(api, "medico", "medico");
    tAdmin = await token(api, "admin", "admin");
  });

  test("CP-02 V01 · Datos válidos: HTTP 201 y el paciente queda registrado", async () => {
    const r = await api.post("/pacientes", { headers: auth(tMedico), data: { rut: rutValido(), primer_nombre: "María", apellido_paterno: "Fernández", apellido_materno: "López", fecha_nacimiento: "1950-05-10", sexo: "F", email: `maria.fernandez.${sufijo()}@correo.cl` } });
    expect(r.status()).toBe(201);
    creado = await r.json();
  });
  test("CP-02 V02 · El registro del paciente queda auditado", async () => {
    const logs = await (await api.get("/auditoria", { headers: auth(tAdmin) })).json();
    expect(logs.some((l) => l.accion.startsWith("PACIENTES_CREAR") && l.accion.includes(creado.rut))).toBe(true);
  });
  test("CP-02 V03 · Datos inválidos: HTTP 400 con error en rut, email y fecha_nacimiento", async () => {
    const r = await api.post("/pacientes", { headers: auth(tMedico), data: { rut: "12345678", primer_nombre: "Juan", apellido_paterno: "Torres", fecha_nacimiento: "", sexo: "M", email: "juan.torres" } });
    const campos = (await r.json()).detalles.map((d) => d.field);
    expect(r.status()).toBe(400);
    expect(campos).toEqual(expect.arrayContaining(["rut", "email", "fecha_nacimiento"]));
  });
  test.fail("CP-02 V04 · RUT con dígito verificador incorrecto (12.345.678-9): HTTP 400 (INC-09)", async () => {
    const r = await api.post("/pacientes", { headers: auth(tMedico), data: { rut: "12.345.678-9", primer_nombre: "Dígito", apellido_paterno: "Erróneo", fecha_nacimiento: "1960-01-01", sexo: "M", email: `dv.${sufijo()}@correo.cl` } });
    expect(r.status()).toBe(400);
  });
});

test.describe.serial("CP-16 · Autorregistro con rol paciente por defecto (RF-2.1)", () => {
  const id = sufijo();
  const datos = { nombre_usuario: `qa_auto_${id}`, password: CLAVE_QA, correo: `qa_auto_${id}@correo.cl` };

  test("CP-16 V01 · El registro se crea con HTTP 201", async () => {
    expect((await api.post("/autenticacion/registro", { data: datos })).status()).toBe(201);
  });
  test("CP-16 V02 · El usuario ingresa con el rol paciente", async () => {
    const t = await token(api, datos.nombre_usuario, datos.password);
    const payload = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
    expect(payload.rolNombre).toBe("paciente");
  });
  test("CP-16 V03 · El registro duplicado se rechaza con HTTP 400", async () => {
    expect((await api.post("/autenticacion/registro", { data: datos })).status()).toBe(400);
  });
});

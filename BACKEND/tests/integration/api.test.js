// PRUEBAS DE INTEGRACIÓN (caja gris)
// Verifican que la API, la validación, la seguridad (JWT y roles) y la base de datos
// PostgreSQL funcionen bien JUNTAS. Requieren la base de datos encendida:
//   docker compose up -d cuidarteplus-postgres-et
const request = require("supertest");
const app = require("../../src/app");
const { pool } = require("../../src/db");

const sufijo = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Dígito verificador de un RUT chileno (módulo 11)
function dv(numero) {
  let suma = 0;
  let factor = 2;
  for (const d of String(numero).split("").reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
const numeroAleatorio = () => 10000000 + Math.floor(Math.random() * 8999999);
const rutValido = () => { const n = numeroAleatorio(); return `${n}-${dv(n)}`; };
const rutConDvIncorrecto = () => { const n = numeroAleatorio(); return `${n}-${dv(n) === "0" ? "1" : "0"}`; };

async function iniciarSesion(usuario, clave) {
  const res = await request(app).post("/autenticacion/login").send({ nombre_usuario: usuario, password: clave });
  return res.body.token;
}

async function crearUsuarioDePrueba(tokenAdmin) {
  const id = sufijo();
  const res = await request(app)
    .post("/usuarios")
    .set("Authorization", `Bearer ${tokenAdmin}`)
    .send({ nombre_usuario: `prueba${id}`, contrasena_hash: "Clave-Prueba-2026!", correo: `prueba${id}@test.cl`, rol_id: 3 });
  return res.body;
}

let tokenAdmin;
let tokenMedico;
let tokenPaciente;

beforeAll(async () => {
  tokenAdmin = await iniciarSesion("admin", "admin");
  tokenMedico = await iniciarSesion("medico", "medico");
  tokenPaciente = await iniciarSesion("paciente", "paciente");
});

afterAll(async () => {
  await pool.end();
});

describe("RF-1 Autenticación y sesión", () => {
  test("Credenciales correctas -> 200 y entrega un token JWT", async () => {
    const res = await request(app).post("/autenticacion/login").send({ nombre_usuario: "admin", password: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.token.split(".")).toHaveLength(3);
  });

  test("Contraseña incorrecta -> 401 con mensaje genérico", async () => {
    const res = await request(app).post("/autenticacion/login").send({ nombre_usuario: "admin", password: "equivocada" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciales inválidas");
  });

  test("Usuario inexistente -> 401 con el mismo mensaje (no revela si el usuario existe)", async () => {
    const res = await request(app).post("/autenticacion/login").send({ nombre_usuario: "noexiste", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciales inválidas");
  });

  test("Datos incompletos -> 400 (lo detiene la validación)", async () => {
    const res = await request(app).post("/autenticacion/login").send({});
    expect(res.status).toBe(400);
  });

  test("Token con la firma alterada -> 401", async () => {
    const alterado = tokenAdmin.slice(0, -3) + "abc";
    const res = await request(app).get("/pacientes").set("Authorization", `Bearer ${alterado}`);
    expect(res.status).toBe(401);
  });
});

describe("RF-2.1 Autorregistro con rol paciente por defecto", () => {
  test("Registro válido -> 201 y la cuenta queda con rol paciente", async () => {
    const id = sufijo();
    const res = await request(app)
      .post("/autenticacion/registro")
      .send({ nombre_usuario: `rosa${id}`, password: "Clave-Segura-2026", correo: `rosa${id}@correo.cl` });
    expect(res.status).toBe(201);
    const roles = await pool.query(
      "SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1",
      [res.body.usuario.id]
    );
    expect(roles.rows.map((r) => r.nombre)).toEqual(["paciente"]);
  });

  test("Usuario o correo duplicado -> 400", async () => {
    const res = await request(app)
      .post("/autenticacion/registro")
      .send({ nombre_usuario: "admin", password: "Clave-Segura-2026", correo: "otro@correo.cl" });
    expect(res.status).toBe(400);
  });
});

describe("RF-2.2 / RF-2.4 / RB-3 Gestión de pacientes por rol", () => {
  test("Sin token no se pueden listar pacientes -> 401", async () => {
    const res = await request(app).get("/pacientes");
    expect(res.status).toBe(401);
  });

  test("El médico lista los pacientes -> 200 (RB-3)", async () => {
    const res = await request(app).get("/pacientes").set("Authorization", `Bearer ${tokenMedico}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(7);
  });

  test("El paciente NO puede listar a todos los pacientes -> 403 (RB-1)", async () => {
    const res = await request(app).get("/pacientes").set("Authorization", `Bearer ${tokenPaciente}`);
    expect(res.status).toBe(403);
  });

  test("El paciente NO puede ver la ficha de otro paciente -> 403 (Ley 20.584)", async () => {
    const res = await request(app).get("/pacientes/2").set("Authorization", `Bearer ${tokenPaciente}`);
    expect(res.status).toBe(403);
  });

  test("El médico registra un paciente válido -> 201 y queda en la base de datos", async () => {
    const rut = rutValido();
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", `Bearer ${tokenMedico}`)
      .send({
        rut,
        primer_nombre: "Rosa",
        apellido_paterno: "Muñoz",
        fecha_nacimiento: "1950-05-10",
        sexo: "F",
        email: `rosa.${sufijo()}@correo.cl`,
      });
    expect(res.status).toBe(201);
    const fila = await pool.query("SELECT rut FROM pacientes WHERE id = $1", [res.body.id]);
    expect(fila.rows[0].rut).toBe(rut);
  });
});

describe("RF-2.5 / RF-2.6 Administración de usuarios", () => {
  test("El administrador lista los usuarios -> 200", async () => {
    const res = await request(app).get("/usuarios").set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("El médico NO puede listar los usuarios -> 403", async () => {
    const res = await request(app).get("/usuarios").set("Authorization", `Bearer ${tokenMedico}`);
    expect(res.status).toBe(403);
  });

  test("El administrador crea un usuario -> 201", async () => {
    const nuevo = await crearUsuarioDePrueba(tokenAdmin);
    expect(nuevo.id).toBeDefined();
  });
});

describe("RF-3.1 / RF-4.1 Exámenes médicos", () => {
  test("El médico registra un examen para un paciente -> 201", async () => {
    const res = await request(app)
      .post("/examenes")
      .set("Authorization", `Bearer ${tokenMedico}`)
      .send({ tipo_examen_medico_id: 1, paciente_id: 1, diagnosis: "Control anual" });
    expect(res.status).toBe(201);
  });

  test("El paciente consulta sus exámenes -> 200 y solo recibe los propios", async () => {
    const res = await request(app).get("/examenes").set("Authorization", `Bearer ${tokenPaciente}`);
    expect(res.status).toBe(200);
    expect(res.body.every((e) => Number(e.paciente_id) === 1)).toBe(true);
  });
});

describe("RF-5.1 Auditoría", () => {
  test("El administrador consulta la auditoría y ve el inicio de sesión registrado", async () => {
    const res = await request(app).get("/auditoria").set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("LOGIN");
  });
});

// ---------------------------------------------------------------------------
// DEF-01 y DEF-02: defectos críticos de control de acceso (NFR-SEG-4, RB-2).
// Son pruebas normales: deben pasar. Quedan como pruebas de REGRESIÓN.
// ---------------------------------------------------------------------------
describe("NFR-SEG-4 / RB-2 Solo un administrador gestiona usuarios", () => {
  test("DEF-01 (INC-24): sin token NO se puede eliminar un usuario -> 401", async () => {
    const victima = await crearUsuarioDePrueba(tokenAdmin);
    const res = await request(app).delete(`/usuarios/${victima.id}`);
    expect(res.status).toBe(401);
    const sigue = await pool.query("SELECT id FROM usuarios WHERE id = $1", [victima.id]);
    expect(sigue.rows).toHaveLength(1);
  });

  test("DEF-01 (INC-24): un médico NO puede eliminar usuarios -> 403", async () => {
    const victima = await crearUsuarioDePrueba(tokenAdmin);
    const res = await request(app).delete(`/usuarios/${victima.id}`).set("Authorization", `Bearer ${tokenMedico}`);
    expect(res.status).toBe(403);
  });

  test("DEF-02 (INC-22): un paciente NO puede crear un usuario administrador -> 403", async () => {
    const id = sufijo();
    const res = await request(app)
      .post("/usuarios")
      .set("Authorization", `Bearer ${tokenPaciente}`)
      .send({ nombre_usuario: `intruso${id}`, contrasena_hash: "Intruso-2026!", correo: `intruso${id}@test.cl`, rol_id: 1 });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DEFECTOS CONOCIDOS (registrados en el informe, pendientes de corrección).
// ---------------------------------------------------------------------------
describe("Defectos conocidos (pendientes de corrección)", () => {
  test.failing("INC-29 / NFR-SEG-2: la contraseña debe almacenarse con hash (bcrypt), no en texto plano", async () => {
    const fila = await pool.query("SELECT contrasena FROM usuarios WHERE nombre_usuario = 'admin'");
    expect(fila.rows[0].contrasena).toMatch(/^\$2[aby]\$/);
  });

  test.failing("INC-18 / RF-1.2: debe existir el cierre de sesión con revocación del token", async () => {
    const res = await request(app).post("/autenticacion/logout").set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });

  test.failing("INC-09 / RF-2.2: la API debe rechazar un RUT con dígito verificador incorrecto", async () => {
    const res = await request(app)
      .post("/pacientes")
      .set("Authorization", `Bearer ${tokenMedico}`)
      .send({
        rut: rutConDvIncorrecto(),
        primer_nombre: "Dato",
        apellido_paterno: "Inválido",
        fecha_nacimiento: "1960-01-01",
        sexo: "M",
        email: `dv.${sufijo()}@correo.cl`,
      });
    expect(res.status).toBe(400);
  });

  test.failing("INC-13 / RF-2.7: el administrador elimina un usuario -> 200 (hoy responde 500 y no queda auditado)", async () => {
    const victima = await crearUsuarioDePrueba(tokenAdmin);
    const res = await request(app).delete(`/usuarios/${victima.id}`).set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });

  test.failing("INC-08 / RF-5.1: un paciente NO debe poder insertar registros de auditoría", async () => {
    const res = await request(app)
      .post("/auditoria")
      .set("Authorization", `Bearer ${tokenPaciente}`)
      .send({ accion: "registro falso" });
    expect(res.status).toBe(403);
  });
});

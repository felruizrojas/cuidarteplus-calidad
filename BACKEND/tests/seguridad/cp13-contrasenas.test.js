// CP-13 · Política de contraseñas y hashing (NFR-SEG-2)
// Herramienta: Jest + Supertest + consulta a PostgreSQL.
const { pool } = require("../../src/db");
const { app, request, auth, sufijo, iniciarSesion } = require("../apoyo");

afterAll(() => pool.end());

async function registrar(clave) {
  const id = sufijo();
  return request(app).post("/autenticacion/registro").send({ nombre_usuario: `debil_${id}`, password: clave, correo: `debil_${id}@correo.cl` });
}

describe("CP-13 · Política de contraseñas y hashing", () => {
  test.failing.each([["123456"], ["abcdefgh"], ["Abcdefgh123"]])(
    "CP-13 V · El registro con la contraseña débil %s se rechaza (400) (INC-30)",
    async (clave) => {
      const res = await registrar(clave);
      expect(res.status).toBe(400);
    }
  );

  test.failing("CP-13 V04 · El administrador no puede crear un usuario con contraseña de 6 caracteres (INC-30)", async () => {
    const token = await iniciarSesion("admin", "admin");
    const id = sufijo();
    const res = await request(app).post("/usuarios").set(auth(token))
      .send({ nombre_usuario: `corta_${id}`, contrasena_hash: "abc123", correo: `corta_${id}@correo.cl`, rol_id: 3 });
    expect(res.status).toBe(400);
  });

  test.failing("CP-13 V05 · La contraseña se almacena como hash bcrypt (INC-29)", async () => {
    const res = await registrar("Cuidarte2026!#");
    const fila = await pool.query("SELECT contrasena FROM usuarios WHERE id = $1", [res.body.usuario.id]);
    expect(fila.rows[0].contrasena).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  test.failing("CP-13 V06 · El sistema bloquea o limita tras varios intentos fallidos (429/423) (INC-31)", async () => {
    const estados = [];
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post("/autenticacion/login").send({ nombre_usuario: "paciente", password: `mala${i}` });
      estados.push(r.status);
    }
    expect(estados.some((s) => s === 429 || s === 423)).toBe(true);
  });
});

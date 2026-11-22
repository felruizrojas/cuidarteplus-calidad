// CP-30 · Pruebas unitarias del registro y de la política de contraseñas (RF-2.1, NFR-SEG-2)
// Herramienta: Jest. Política del ERS: 12+ caracteres con mayúscula, minúscula, número y símbolo.
const backend = require("../../src/validations/auth");
const frontend = require("../../../FRONTEND/src/validations/auth");

const debiles = [
  ["de 6 caracteres", "abc123"],
  ["de 11 caracteres", "Abcdefgh12!"],
  ["sin mayúscula", "cuidarte2026!#"],
  ["sin número", "Cuidartesalud!#"],
  ["sin símbolo", "Cuidarte2026ab"],
];

describe("CP-30 · Registro e inicio de sesión en el backend", () => {
  const base = { nombre_usuario: "rosa.munoz", correo: "rosa.munoz@correo.cl", password: "Cuidarte2026!#" };

  test("CP-30 V01 · El registro válido se acepta", async () => {
    await expect(backend.registerSchema.isValid(base)).resolves.toBe(true);
  });

  for (const [nombre, clave] of debiles) {
    test.failing(`CP-30 V · Se rechaza la contraseña ${nombre} (INC-02)`, async () => {
      await expect(backend.registerSchema.isValid({ ...base, password: clave })).resolves.toBe(false);
    });
  }

  test("CP-30 V07 · Se rechaza el nombre de usuario de 2 caracteres", async () => {
    await expect(backend.registerSchema.isValid({ ...base, nombre_usuario: "ab" })).resolves.toBe(false);
  });

  test("CP-30 V08 · Se rechaza el correo sin dominio", async () => {
    await expect(backend.registerSchema.isValid({ ...base, correo: "paciente.correo" })).resolves.toBe(false);
  });

  test("CP-30 V09 · Se rechaza el inicio de sesión con los campos vacíos", async () => {
    await expect(backend.loginSchema.isValid({ nombre_usuario: "", password: "" })).resolves.toBe(false);
  });
});

describe("CP-30 · Registro en el frontend (mismas reglas)", () => {
  const base = { nombre_usuario: "rosa.munoz", correo: "rosa.munoz@correo.cl", contrasena_hash: "Cuidarte2026!#" };

  test("CP-30 V10 · El registro válido se acepta en el frontend", async () => {
    await expect(frontend.registerUserSchema.isValid(base)).resolves.toBe(true);
  });

  for (const [nombre, clave] of debiles) {
    test.failing(`CP-30 V · Frontend rechaza la contraseña ${nombre} (INC-02)`, async () => {
      await expect(frontend.registerUserSchema.isValid({ ...base, contrasena_hash: clave })).resolves.toBe(false);
    });
  }

  test("CP-30 V16 · Frontend rechaza el usuario de 2 caracteres y el correo sin dominio", async () => {
    await expect(frontend.registerUserSchema.isValid({ ...base, nombre_usuario: "ab" })).resolves.toBe(false);
    await expect(frontend.registerUserSchema.isValid({ ...base, correo: "paciente.correo" })).resolves.toBe(false);
  });
});

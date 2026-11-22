// PRUEBAS UNITARIAS DE CAJA NEGRA
// Se diseñaron leyendo los requisitos del ERS de Cuidarte+, sin mirar el código:
// particiones de equivalencia y valores límite.
const { loginSchema, registerSchema } = require("../../src/validations/auth");
const { pacienteSchema } = require("../../src/validations/pacientes");
const { examenMedicoSchema } = require("../../src/validations/examenes");

const esValido = (schema, datos) => schema.isValid(datos);

describe("RF-1.1 Login: largo del nombre de usuario (3 a 50 caracteres)", () => {
  test.each([
    ["vacío", "", false],
    ["2 caracteres (límite inferior - 1)", "ab", false],
    ["3 caracteres (límite inferior)", "abc", true],
    ["50 caracteres (límite superior)", "a".repeat(50), true],
    ["51 caracteres (límite superior + 1)", "a".repeat(51), false],
  ])("CN-%#: usuario %s -> válido: %s", async (_caso, usuario, esperado) => {
    await expect(esValido(loginSchema, { nombre_usuario: usuario, password: "x" })).resolves.toBe(esperado);
  });

  test("CN-06: sin contraseña -> inválido", async () => {
    await expect(esValido(loginSchema, { nombre_usuario: "medico" })).resolves.toBe(false);
  });
});

describe("RF-2.1 Autorregistro: correo y RUT", () => {
  const base = { nombre_usuario: "rosa.munoz", password: "Clave-Segura-2026", correo: "rosa@correo.cl" };

  test("CN-07: datos correctos -> válido", async () => {
    await expect(esValido(registerSchema, base)).resolves.toBe(true);
  });

  test.each([
    ["sin arroba", "rosa.correo.cl"],
    ["sin dominio", "rosa@"],
    ["vacío", ""],
  ])("CN-08: correo %s -> inválido", async (_caso, correo) => {
    await expect(esValido(registerSchema, { ...base, correo })).resolves.toBe(false);
  });

  test.each([
    ["con puntos y guion", "12.345.678-5", true],
    ["sin puntos", "12345678-5", true],
    ["dígito verificador K", "16789456-K", true],
    ["sin guion", "123456785", false],
    ["con letras", "12A45678-5", false],
  ])("CN-09: RUT %s -> válido: %s", async (_caso, rut, esperado) => {
    await expect(esValido(registerSchema, { ...base, rut })).resolves.toBe(esperado);
  });
});

describe("RF-2.2 Registro de paciente: campos obligatorios y dominios", () => {
  const paciente = {
    rut: "11111111-1",
    primer_nombre: "Rosa",
    apellido_paterno: "Muñoz",
    fecha_nacimiento: "1950-05-10",
    sexo: "F",
    email: "rosa.munoz@correo.cl",
  };

  test("CN-10: paciente con datos mínimos correctos -> válido", async () => {
    await expect(esValido(pacienteSchema, paciente)).resolves.toBe(true);
  });

  test.each(["rut", "primer_nombre", "apellido_paterno", "fecha_nacimiento", "sexo", "email"])(
    "CN-11: falta el campo obligatorio %s -> inválido",
    async (campo) => {
      const datos = { ...paciente };
      delete datos[campo];
      await expect(esValido(pacienteSchema, datos)).resolves.toBe(false);
    }
  );

  test.each([
    ["M", true],
    ["F", true],
    ["O", true],
    ["X", false],
  ])("CN-12: sexo %s -> válido: %s", async (sexo, esperado) => {
    await expect(esValido(pacienteSchema, { ...paciente, sexo })).resolves.toBe(esperado);
  });

  test.each([
    ["1 carácter (límite - 1)", "R", false],
    ["2 caracteres (límite inferior)", "Ro", true],
    ["50 caracteres (límite superior)", "R".repeat(50), true],
    ["51 caracteres (límite + 1)", "R".repeat(51), false],
  ])("CN-13: primer nombre de %s -> válido: %s", async (_caso, primer_nombre, esperado) => {
    await expect(esValido(pacienteSchema, { ...paciente, primer_nombre })).resolves.toBe(esperado);
  });

  test("CN-14: fecha de nacimiento futura -> inválido", async () => {
    const manana = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await expect(esValido(pacienteSchema, { ...paciente, fecha_nacimiento: manana })).resolves.toBe(false);
  });

  test("CN-15: grupo sanguíneo fuera del catálogo -> inválido", async () => {
    await expect(esValido(pacienteSchema, { ...paciente, grupo_sanguineo: "C+" })).resolves.toBe(false);
  });
});

describe("RF-3.1 Registro de examen médico", () => {
  const examen = { tipo_examen_medico_id: 1, paciente_id: 1, diagnosis: "Control anual" };

  test("CN-16: examen correcto -> válido", async () => {
    await expect(esValido(examenMedicoSchema, examen)).resolves.toBe(true);
  });

  test.each([
    ["texto", "abc"],
    ["cero", 0],
    ["negativo", -3],
    ["decimal", 1.5],
  ])("CN-17: tipo de examen %s -> inválido", async (_caso, valor) => {
    await expect(esValido(examenMedicoSchema, { ...examen, tipo_examen_medico_id: valor })).resolves.toBe(false);
  });

  test.each([
    ["2000 caracteres (límite superior)", 2000, true],
    ["2001 caracteres (límite + 1)", 2001, false],
  ])("CN-18: diagnóstico de %s -> válido: %s", async (_caso, largo, esperado) => {
    await expect(esValido(examenMedicoSchema, { ...examen, diagnosis: "a".repeat(largo) })).resolves.toBe(esperado);
  });
});

// ---------------------------------------------------------------------------
// DEFECTOS CONOCIDOS (registrados en el informe, pendientes de corrección).
// test.failing: la prueba describe el comportamiento que EXIGE el ERS y hoy
// falla. Jest la informa como aprobada mientras el defecto exista; cuando el
// equipo lo corrija, Jest avisará para convertirla en una prueba normal.
// ---------------------------------------------------------------------------
describe("Defectos conocidos (pendientes de corrección)", () => {
  test.failing("INC-01 / RF-2.2: un RUT con dígito verificador incorrecto debe rechazarse", async () => {
    const paciente = {
      rut: "11111111-2", // el dígito verificador correcto es 1
      primer_nombre: "Rosa",
      apellido_paterno: "Muñoz",
      fecha_nacimiento: "1950-05-10",
      sexo: "F",
      email: "rosa.munoz@correo.cl",
    };
    await expect(esValido(pacienteSchema, paciente)).resolves.toBe(false);
  });

  test.failing("INC-02 / ERS 2.4: una contraseña de menos de 12 caracteres debe rechazarse", async () => {
    const datos = { nombre_usuario: "rosa.munoz", password: "abc123", correo: "rosa@correo.cl" };
    await expect(esValido(registerSchema, datos)).resolves.toBe(false);
  });
});

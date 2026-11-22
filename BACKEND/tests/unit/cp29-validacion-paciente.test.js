// CP-29 · Pruebas unitarias de validación de datos del paciente (RF-2.2, RF-2.3)
// Herramienta: Jest. Esquemas del backend y del frontend + normalización del RUT, sin servidor ni BD.
const backend = require("../../src/validations/pacientes");
const { normalizeRut } = require("../../src/utils/rut");
const frontend = require("../../../FRONTEND/src/validations/pacientes");

const valido = {
  rut: "12.345.678-5",
  primer_nombre: "María",
  apellido_paterno: "Fernández",
  apellido_materno: "López",
  fecha_nacimiento: "1950-05-10",
  sexo: "F",
  email: "maria.fernandez@correo.cl",
};

// Devuelve los campos con error (vacío si es válido)
async function errores(schema, datos) {
  try {
    await schema.validate(datos, { abortEarly: false });
    return [];
  } catch (e) {
    return e.inner.map((i) => i.path);
  }
}

const invalidos = [
  ["RUT sin dígito verificador", { rut: "12345678" }, "rut"],
  ["correo sin dominio", { email: "juan.torres" }, "email"],
  ["fecha de nacimiento futura", { fecha_nacimiento: "2099-01-01" }, "fecha_nacimiento"],
  ["sexo fuera de M/F/O", { sexo: "X" }, "sexo"],
  ["grupo sanguíneo inexistente", { grupo_sanguineo: "Z+" }, "grupo_sanguineo"],
];

describe("CP-29 · Validación de pacientes en el backend", () => {
  test("CP-29 V01 · El paciente válido se acepta", async () => {
    expect(await errores(backend.pacienteSchema, valido)).toEqual([]);
  });

  test.each(invalidos)("CP-29 V · Se rechaza %s con error en su campo", async (_n, cambio, campo) => {
    expect(await errores(backend.pacienteSchema, { ...valido, ...cambio })).toContain(campo);
  });

  test.failing("CP-29 V07 · Se rechaza el RUT con dígito verificador incorrecto (INC-01)", async () => {
    expect(await errores(backend.pacienteSchema, { ...valido, rut: "12.345.678-9" })).toContain("rut");
  });

  test("CP-29 V08 · La edición de paciente sin ningún campo se rechaza", async () => {
    await expect(backend.updatePacienteSchema.isValid({})).resolves.toBe(false);
  });

  test("CP-29 V09 · El RUT 12.345.678-5 se normaliza a 12345678-5", () => {
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
  });

  test("CP-29 V10 · El paciente sin RUT se rechaza (campo obligatorio)", async () => {
    const { rut, ...sinRut } = valido;
    expect(await errores(backend.pacienteSchema, sinRut)).toContain("rut");
  });

  test("CP-29 V11 · La normalización de un RUT vacío no produce errores", () => {
    expect(() => normalizeRut("")).not.toThrow();
    expect(normalizeRut("")).toBe("");
  });
});

describe("CP-29 · Validación de pacientes en el frontend (mismas reglas)", () => {
  test("CP-29 V12 · El paciente válido se acepta en el frontend", async () => {
    expect(await errores(frontend.pacienteSchema, valido)).toEqual([]);
  });

  test.each(invalidos)("CP-29 V · Frontend rechaza %s con error en su campo", async (_n, cambio, campo) => {
    expect(await errores(frontend.pacienteSchema, { ...valido, ...cambio })).toContain(campo);
  });

  test.failing("CP-29 V18 · El frontend rechaza el RUT con dígito verificador incorrecto (INC-01)", async () => {
    expect(await errores(frontend.pacienteSchema, { ...valido, rut: "12.345.678-9" })).toContain("rut");
  });

  test("CP-29 V19 · El frontend rechaza el paciente sin RUT", async () => {
    const { rut, ...sinRut } = valido;
    expect(await errores(frontend.pacienteSchema, sinRut)).toContain("rut");
  });
});

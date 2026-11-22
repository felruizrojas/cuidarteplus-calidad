// CP-31 · Pruebas unitarias del esquema de exámenes y del middleware de validación (RF-3.1, NFR-SEG-5, NFR-SEG-6)
// Herramienta: Jest con dobles de prueba (jest.fn) para la petición y la respuesta.
const { examenMedicoSchema, updateExamenMedicoSchema } = require("../../src/validations/examenes");
const validate = require("../../src/middleware/validate");

const valido = { tipo_examen_medico_id: 1, paciente_id: 1, diagnosis: "Control" };

function respuestaFalsa() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("CP-31 · Esquema de exámenes médicos", () => {
  test("CP-31 V01 · El examen válido se acepta", async () => {
    await expect(examenMedicoSchema.isValid(valido)).resolves.toBe(true);
  });
  test("CP-31 V02 · Se rechaza el tipo de examen no entero (1.5)", async () => {
    await expect(examenMedicoSchema.isValid({ ...valido, tipo_examen_medico_id: 1.5 })).resolves.toBe(false);
  });
  test("CP-31 V03 · Se rechaza el paciente negativo (-3)", async () => {
    await expect(examenMedicoSchema.isValid({ ...valido, paciente_id: -3 })).resolves.toBe(false);
  });
  test("CP-31 V04 · Se rechaza el examen sin paciente", async () => {
    const { paciente_id, ...sinPaciente } = valido;
    await expect(examenMedicoSchema.isValid(sinPaciente)).resolves.toBe(false);
  });
  test("CP-31 V05 · La edición de examen sin ningún campo se rechaza", async () => {
    await expect(updateExamenMedicoSchema.isValid({})).resolves.toBe(false);
  });
});

describe("CP-31 · Middleware de validación (src/middleware/validate.js)", () => {
  test("CP-31 V06 · Cuerpo inválido -> HTTP 400 con detalle por campo y sin continuar al controlador", async () => {
    const res = respuestaFalsa();
    const next = jest.fn();
    await validate(examenMedicoSchema)({ body: { paciente_id: -3 } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const campos = res.json.mock.calls[0][0].detalles.map((d) => d.field);
    expect(campos).toEqual(expect.arrayContaining(["tipo_examen_medico_id", "paciente_id"]));
    expect(next).not.toHaveBeenCalled();
  });

  test("CP-31 V07 · Cuerpo válido -> el middleware continúa hacia el controlador", async () => {
    const next = jest.fn();
    await validate(examenMedicoSchema)({ body: { ...valido } }, respuestaFalsa(), next);
    expect(next).toHaveBeenCalled();
  });

  test.failing("CP-31 V08 · El campo no declarado (usuario_id) se elimina antes del controlador (INC-03)", async () => {
    const req = { body: { ...valido, usuario_id: 1 } };
    await validate(examenMedicoSchema)(req, respuestaFalsa(), jest.fn());
    expect(req.body.usuario_id).toBeUndefined();
  });

  test.failing("CP-31 V09 · Error inesperado con mensaje -> respuesta genérica sin detalle interno (INC-04)", async () => {
    const roto = { validate: () => Promise.reject(new Error("connection refused at 10.0.0.5:5432")) };
    const res = respuestaFalsa();
    await validate(roto)({ body: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/10\.0\.0\.5|5432/);
  });

  test.failing("CP-31 V10 · Error inesperado sin mensaje -> respuesta genérica sin detalle interno (INC-04)", async () => {
    const errorSinMensaje = { toString: () => "ECONNRESET db-interna:5432" };
    const roto = { validate: () => Promise.reject(errorSinMensaje) };
    const res = respuestaFalsa();
    await validate(roto)({ body: {} }, res, jest.fn());
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/db-interna|ECONNRESET/);
  });
});

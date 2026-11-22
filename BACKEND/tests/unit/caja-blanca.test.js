// PRUEBAS UNITARIAS DE CAJA BLANCA
// Se diseñaron mirando el código: hay un caso por cada camino posible de cada función.
const yup = require("yup");
const { normalizeRut } = require("../../src/utils/rut");
const validate = require("../../src/middleware/validate");
const { updatePacienteSchema } = require("../../src/validations/pacientes");
const { updateExamenMedicoSchema } = require("../../src/validations/examenes");

describe("normalizeRut (src/utils/rut.js)", () => {
  // Camino 1: if (!rut) return rut;
  test.each([[null], [undefined], [""]])("Camino 1: valor vacío (%p) se devuelve sin cambios", (valor) => {
    expect(normalizeRut(valor)).toBe(valor);
  });

  // Camino 2: rut.replace(/\./g, "")
  test("Camino 2: elimina todos los puntos y conserva guion y dígito verificador", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
  });

  test("Camino 2 (sin puntos): un RUT ya normalizado no cambia", () => {
    expect(normalizeRut("16789456-K")).toBe("16789456-K");
  });
});

describe("validate (src/middleware/validate.js): los tres caminos del portero", () => {
  function crearRespuestaFalsa() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }
  const schema = yup.object({ nombre: yup.string().required("El nombre es requerido") });

  test("Camino 1: datos válidos -> deja pasar la petición (llama a next)", async () => {
    const next = jest.fn();
    await validate(schema)({ body: { nombre: "Ana" } }, crearRespuestaFalsa(), next);
    expect(next).toHaveBeenCalled();
  });

  test("Camino 2: datos inválidos -> responde 400 y explica el campo con error", async () => {
    const res = crearRespuestaFalsa();
    const next = jest.fn();
    await validate(schema)({ body: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].detalles[0].field).toBe("nombre");
  });

  test("Camino 3: error inesperado -> responde 500", async () => {
    const schemaRoto = { validate: () => Promise.reject(new Error("falla interna")) };
    const res = crearRespuestaFalsa();
    await validate(schemaRoto)({ body: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test("Variante: valida otra fuente de datos (req.query)", async () => {
    const next = jest.fn();
    await validate(schema, "query")({ query: { nombre: "Ana" } }, crearRespuestaFalsa(), next);
    expect(next).toHaveBeenCalled();
  });

  // Defectos conocidos detectados con caja blanca (ver informe, apartado 5.3)
  test.failing("INC-03: debe eliminar los campos no declarados antes de llegar a la ruta", async () => {
    const req = { body: { nombre: "Ana", usuario_id: 1 } };
    await validate(schema)(req, crearRespuestaFalsa(), jest.fn());
    expect(req.body.usuario_id).toBeUndefined();
  });

  test.failing("INC-04: ante un error inesperado no debe exponer el mensaje interno", async () => {
    const schemaRoto = { validate: () => Promise.reject(new Error("detalle interno de la BD")) };
    const res = crearRespuestaFalsa();
    await validate(schemaRoto)({ body: {} }, res, jest.fn());
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("detalle interno");
  });
});

describe("Regla 'al menos un campo' de los esquemas de actualización", () => {
  // Dos caminos de la función test(): objeto vacío (false) u objeto con campos (true)
  test.each([
    ["paciente", updatePacienteSchema, { telefono: "+56911111111" }],
    ["examen", updateExamenMedicoSchema, { notas: "Control en 6 meses" }],
  ])("Actualizar %s con un campo -> válido", async (_n, schema, datos) => {
    await expect(schema.isValid(datos)).resolves.toBe(true);
  });

  test.each([
    ["paciente", updatePacienteSchema],
    ["examen", updateExamenMedicoSchema],
  ])("Actualizar %s sin campos -> inválido", async (_n, schema) => {
    await expect(schema.isValid({})).resolves.toBe(false);
  });
});

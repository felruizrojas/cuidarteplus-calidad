// CP-03 · Adjuntar documento en formato permitido (RF-4.3): PDF, DOC, PPT, JPG y PNG, un documento por examen y ≤ 10 s.
const { test, expect } = require("@playwright/test");
const { nuevaApi, token, crearPaciente, crearExamen, subirDocumento, PDF } = require("../apoyo");

let api, t, pacienteId;
test.beforeAll(async () => {
  api = await nuevaApi();
  t = await token(api, "medico", "medico");
  pacienteId = (await crearPaciente(api, t)).id;
});

async function subirEnExamenNuevo(nombre, mime, contenido = Buffer.from(`contenido ficticio ${nombre}`)) {
  const examen = await crearExamen(api, t, pacienteId);
  const inicio = Date.now();
  const r = await subirDocumento(api, t, examen.body.id, pacienteId, nombre, contenido, mime);
  return { status: r.status(), segundos: (Date.now() - inicio) / 1000, examenId: examen.body.id, body: await r.text() };
}

test("CP-03 V01 · El documento PDF se acepta con HTTP 201 en ≤ 10 s", async () => {
  const r = await subirEnExamenNuevo("resultado_examen.pdf", "application/pdf", PDF);
  expect(r.status).toBe(201);
  expect(r.segundos).toBeLessThanOrEqual(10);
});

for (const [n, nombre, mime] of [
  ["V02", "informe.doc", "application/msword"],
  ["V03", "presentacion.ppt", "application/vnd.ms-powerpoint"],
  ["V04", "radiografia.jpg", "image/jpeg"],
  ["V05", "ecografia.png", "image/png"],
]) {
  test.fail(`CP-03 ${n} · El documento ${nombre} se acepta con HTTP 201 en ≤ 10 s (INC-10)`, async () => {
    const r = await subirEnExamenNuevo(nombre, mime);
    expect(r.status).toBe(201);
    expect(r.segundos).toBeLessThanOrEqual(10);
  });
}

test.fail("CP-03 V06 · El .exe se rechaza con un error controlado (400/415) que indica los formatos permitidos (INC-11)", async () => {
  const r = await subirEnExamenNuevo("informe.exe", "application/x-msdownload");
  expect([400, 415]).toContain(r.status);
});

test.fail("CP-03 V07 · Un segundo documento en el mismo examen se rechaza (un documento por examen) (INC-12)", async () => {
  const primero = await subirEnExamenNuevo("resultado_examen.pdf", "application/pdf", PDF);
  const segundo = await subirDocumento(api, t, primero.examenId, pacienteId, "segundo.pdf", PDF);
  expect([400, 409]).toContain(segundo.status());
});

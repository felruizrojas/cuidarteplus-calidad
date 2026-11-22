// PRUEBAS DE SISTEMA: CP-20 (editar y eliminar examen o documento) y CP-21 (paciente descarga en ≤ 10 s).
const { test, expect } = require("@playwright/test");
const { nuevaApi, token, auth, crearPaciente, crearExamen, subirDocumento, psql, sha256, PDF, TIPO, iniciarSesionComo } = require("../apoyo");

let api, tAdmin, tMedico, tPaciente;
test.beforeAll(async () => {
  api = await nuevaApi();
  tAdmin = await token(api, "admin", "admin");
  tMedico = await token(api, "medico", "medico");
  tPaciente = await token(api, "paciente", "paciente");
});

test.describe.serial("CP-20 · Editar y eliminar (lógica, con confirmación) examen o documento (RF-3.2, RF-3.3)", () => {
  let paciente, examen, documentoId;
  test.beforeAll(async () => {
    paciente = await crearPaciente(api, tMedico);
    examen = (await crearExamen(api, tMedico, paciente.id)).body;
    documentoId = (await (await subirDocumento(api, tMedico, examen.id, paciente.id)).json()).documentos[0].id;
  });

  test("CP-20 V01 · El médico edita el examen (200)", async () => {
    const r = await api.put(`/examenes/${examen.id}`, { headers: auth(tMedico), data: { notas: "Repetir en 3 meses" } });
    expect(r.status()).toBe(200);
  });
  test.fail("CP-20 V02 · El médico elimina un documento del examen (RF-3.3) (INC-14)", async () => {
    expect((await api.delete(`/documentos/${documentoId}`, { headers: auth(tMedico) })).status()).toBe(200);
  });
  test.fail("CP-20 V03 · El médico elimina el examen (RF-3.3) (INC-14)", async () => {
    expect((await api.delete(`/examenes/${examen.id}`, { headers: auth(tMedico) })).status()).toBe(200);
  });
  test("CP-20 V04 · La interfaz solicita confirmación antes de eliminar el examen", async ({ page }) => {
    await iniciarSesionComo(page, "admin");
    await page.goto(`/examenes/${examen.id}`);
    await page.getByRole("button", { name: "Eliminar" }).first().click();
    await expect(page.getByRole("dialog").getByText("Confirmar eliminación")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
  });
  test.fail("CP-20 V05 · La eliminación es lógica: el registro se conserva con marca de baja (INC-15)", async () => {
    const r = await api.delete(`/examenes/${examen.id}`, { headers: auth(tAdmin) });
    expect(r.status()).toBe(200);
    expect(psql(`SELECT COUNT(*) FROM examen_medico WHERE id = ${examen.id}`)).toBe("1");
  });
  test("CP-20 V06 · El paciente no puede editar exámenes (403)", async () => {
    const otro = (await crearExamen(api, tMedico, 1)).body;
    expect((await api.put(`/examenes/${otro.id}`, { headers: auth(tPaciente), data: { notas: "x" } })).status()).toBe(403);
  });
});

test.describe.serial("CP-21 · Paciente visualiza y descarga sus exámenes en ≤ 10 s (RF-4.1, RF-4.2)", () => {
  let documentoId, desdeAuditoria;
  test.beforeAll(async () => {
    const ecg = (await crearExamen(api, tMedico, 1, TIPO.electrocardiograma, "Control CP-21")).body;
    documentoId = (await (await subirDocumento(api, tMedico, ecg.id, 1, "ecg_resultado.pdf")).json()).documentos[0].id;
    desdeAuditoria = Number(psql("SELECT COALESCE(MAX(id),0) FROM auditoria"));
  });

  test("CP-21 V01 · El paciente ve solo sus propios exámenes (200)", async () => {
    const r = await api.get("/examenes", { headers: auth(tPaciente) });
    const examenes = await r.json();
    expect(r.status()).toBe(200);
    expect(examenes.length).toBeGreaterThan(0);
    expect(examenes.every((e) => Number(e.paciente_id) === 1)).toBe(true);
  });
  test("CP-21 V02 · La descarga responde HTTP 200 en ≤ 10 s y el archivo es íntegro", async () => {
    const inicio = Date.now();
    const r = await api.get(`/documentos/${documentoId}`, { headers: auth(tPaciente) });
    const segundos = (Date.now() - inicio) / 1000;
    expect(r.status()).toBe(200);
    expect(segundos).toBeLessThanOrEqual(10);
    expect(sha256(await r.body())).toBe(sha256(PDF));
  });
  test("CP-21 V03 · Recorrido en la interfaz: Mis Resultados → abrir examen → descargar", async ({ page }) => {
    await iniciarSesionComo(page, "paciente");
    await page.goto("/mis-resultados");
    await page.getByText("Electrocardiograma", { exact: true }).first().click();
    const descarga = page.waitForEvent("download");
    await page.getByRole("button", { name: /ecg_resultado\.pdf/ }).first().click();
    expect((await descarga).suggestedFilename()).toMatch(/\.pdf$/);
  });
  test.fail("CP-21 V04 · La descarga queda registrada en la auditoría (INC-16)", async () => {
    const n = psql(`SELECT COUNT(*) FROM auditoria WHERE id > ${desdeAuditoria} AND accion ILIKE '%DESCARG%'`);
    expect(Number(n)).toBeGreaterThan(0);
  });
});

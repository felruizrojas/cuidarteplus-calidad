// PRUEBAS DE USABILIDAD: CP-07 (evaluación heurística asistida del flujo del paciente adulto mayor),
// CP-09 (mensajes de error y recuperación) y CP-22 (flujo paciente → exámenes).
const { test, expect } = require("@playwright/test");
const { iniciarSesion, iniciarSesionComo } = require("../apoyo");

test.describe.serial("CP-07 · Evaluación heurística del flujo del paciente adulto mayor (NFR-USAB-2)", () => {
  const hallazgos = { clics: 0, erroresConsola: [], menores: [], descargaOk: false, guiaError: false };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on("console", (m) => m.type() === "error" && hallazgos.erroresConsola.push(m.text()));
    // Heurística H9: el error de inicio de sesión debe orientar al usuario para recuperarse
    await iniciarSesion(page, "paciente", "pacientX");
    const aviso = page.getByText("Credenciales inválidas").first();
    await aviso.waitFor();
    const texto = await page.locator("body").innerText();
    hallazgos.guiaError = /olvid|recuperar|verifique|intente nuevamente|may[uú]sculas/i.test(texto);
    // Flujo login → inicio → Mis Resultados → abrir examen → descargar, contando los clics
    await page.getByTestId("input-password").fill("paciente");
    await page.getByTestId("button-login").click(); hallazgos.clics++;
    await page.waitForURL(/home/);
    const menuAmbiguo = (await page.getByRole("link", { name: "Ir a Exámenes Médicos" }).count()) > 0 && (await page.getByRole("link", { name: "Ir a Mis Resultados" }).count()) > 0;
    if (menuAmbiguo) hallazgos.menores.push("H4: menú con 'Exámenes Médicos' y 'Mis Resultados' para el mismo contenido");
    if ((await page.getByRole("link", { name: "Ir a undefined" }).count()) > 0) hallazgos.menores.push("H1/H4: enlace de inicio sin nombre accesible ('Ir a undefined')");
    await page.getByRole("link", { name: "Ir a Mis Resultados" }).click(); hallazgos.clics++;
    const boton = page.getByRole("button", { name: /ecg_resultado\.pdf/ }).first();
    if (!(await boton.isVisible())) hallazgos.menores.push("H6: documentos ocultos dentro del acordeón del examen");
    await page.getByText("Electrocardiograma", { exact: true }).first().click(); hallazgos.clics++;
    const nombreMostrado = (await boton.innerText()).trim();
    const descarga = page.waitForEvent("download");
    await boton.click(); hallazgos.clics++;
    const archivo = await descarga;
    hallazgos.descargaOk = (await archivo.failure()) === null;
    if (archivo.suggestedFilename() !== nombreMostrado) hallazgos.menores.push(`H2: el archivo descargado (${archivo.suggestedFilename()}) no coincide con el nombre mostrado (${nombreMostrado})`);
    const confirmacion = await page.getByText(/descargad|descarga (iniciada|completada)/i).count();
    if (confirmacion === 0) hallazgos.menores.push("H1: la descarga no muestra confirmación al usuario");
    await page.close();
  });

  test("CP-07 V01 · El flujo se completa en 5 clics o menos", () => {
    test.info().annotations.push({ type: "clics", description: String(hallazgos.clics) });
    expect(hallazgos.clics).toBeLessThanOrEqual(5);
  });
  test("CP-07 V02 · Ningún problema de severidad 4 (el flujo se puede completar)", () => {
    expect(hallazgos.descargaOk).toBe(true);
  });
  test.fail("CP-07 V03 · Ningún problema de severidad 3: el error de ingreso orienta la recuperación (INC-42)", () => {
    expect(hallazgos.guiaError).toBe(true);
  });
  test.fail("CP-07 V04 · Como máximo 2 problemas de severidad 2 (INC-43)", () => {
    test.info().annotations.push({ type: "problemas menores", description: hallazgos.menores.join(" | ") });
    expect(hallazgos.menores.length).toBeLessThanOrEqual(2);
  });
  test.fail("CP-07 V05 · Los mensajes de error indican cómo resolver el problema (INC-42)", () => {
    expect(hallazgos.guiaError).toBe(true);
  });
  test("CP-07 V06 · El flujo no registra errores de JavaScript en la consola", () => {
    expect(hallazgos.erroresConsola.filter((e) => !/401|Failed to load resource/.test(e))).toEqual([]);
  });
});

test.describe.serial("CP-09 · Mensajes de error y recuperación (NFR-USAB-3, RF-1.1)", () => {
  const m = {};
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await iniciarSesion(page, "paciente", "pacientf");
    const avisos = page.getByText("Credenciales inválidas");
    await avisos.first().waitFor();
    await page.waitForTimeout(500);
    m.cantidad = await avisos.count();
    const caja = await avisos.first().boundingBox();
    const form = await page.getByTestId("button-login").boundingBox();
    m.distancia = Math.abs(caja.y - (form.y + form.height));
    m.fuente = await avisos.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    m.recuperacion = await page.getByText(/olvid(ó|aste) (su|tu) contraseña/i).count();
    m.textoInvalido = await avisos.first().innerText();
    await iniciarSesion(page, "no_existe_qa", "Cualquiera123!");
    m.textoInexistente = await page.getByText("Credenciales inválidas").first().innerText();
    m.guiaLogin = await page.getByRole("button", { name: "Guía inicial" }).count();
    await iniciarSesionComo(page, "paciente");
    m.ayuda = await page.getByRole("link", { name: "Ayuda" }).count();
    await page.close();
  });

  test.fail("CP-09 V01 · El mensaje se muestra junto al formulario (INC-46)", () => {
    test.info().annotations.push({ type: "distancia al formulario (px)", description: String(Math.round(m.distancia)) });
    expect(m.distancia).toBeLessThanOrEqual(80);
  });
  test.fail("CP-09 V02 · El mensaje usa texto de al menos 16 px (INC-46)", () => {
    test.info().annotations.push({ type: "tamaño de fuente (px)", description: String(m.fuente) });
    expect(m.fuente).toBeGreaterThanOrEqual(16);
  });
  test.fail("CP-09 V03 · El mensaje aparece una sola vez (sin avisos duplicados) (INC-46)", () => {
    test.info().annotations.push({ type: "avisos", description: String(m.cantidad) });
    expect(m.cantidad).toBe(1);
  });
  test.fail("CP-09 V04 · Existe la opción de recuperar la contraseña (INC-47)", () => {
    expect(m.recuperacion).toBeGreaterThan(0);
  });
  test("CP-09 V05 · El mensaje es genérico ('Credenciales inválidas')", () => {
    expect(m.textoInvalido).toContain("Credenciales inválidas");
  });
  test("CP-09 V06 · El mensaje no revela si el usuario existe", () => {
    expect(m.textoInexistente).toBe(m.textoInvalido);
  });
  test("CP-09 V07 · Existe ayuda contextual accesible desde las pantallas principales", () => {
    expect(m.guiaLogin).toBeGreaterThan(0);
    expect(m.ayuda).toBeGreaterThan(0);
  });
});

test("CP-22 · Flujo de acceso paciente → exámenes: búsqueda por RUT, ficha y luego exámenes (NFR-USAB-4, RF-2.4)", async ({ page }) => {
  await iniciarSesionComo(page, "medico");
  await page.getByRole("link", { name: "Ir a Pacientes" }).click();
  await page.getByLabel("Buscar por RUT").fill("11.111.111-1");
  await page.getByRole("button", { name: "Buscar" }).click();
  // Primero el paciente...
  await expect(page.getByText("Juan").first()).toBeVisible();
  // ...y desde él, sus exámenes
  await page.getByText("Listar Exámenes").click();
  await expect(page.getByText(/Electrocardiograma|Glicemia/).first()).toBeVisible();
});

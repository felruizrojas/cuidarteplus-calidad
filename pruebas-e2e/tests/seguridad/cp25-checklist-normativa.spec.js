// CP-25 · Checklist de cumplimiento normativo de protección de datos (NFR-SEG-8)
// Herramienta: Playwright, contrastando las pantallas con la checklist de las leyes 19.628, 21.719 y 20.584.
const { test, expect } = require("@playwright/test");
const { iniciarSesionComo } = require("../apoyo");

let textoRegistro = "";
let htmlRegistro = "";
let textoPolitica = "";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/registro");
  await page.waitForLoadState("networkidle");
  textoRegistro = await page.locator("body").innerText();
  htmlRegistro = await page.content();
  await iniciarSesionComo(page, "paciente");
  await page.goto("/politica-privacidad");
  await expect(page.getByText("Política de Privacidad").first()).toBeVisible();
  textoPolitica = await page.locator("main").innerText();
  await page.close();
});

test.describe("CP-25 · Formulario de registro (Ley 21.719: consentimiento e información al titular)", () => {
  test.fail("CP-25 V01 · El registro solicita consentimiento explícito (casilla) (INC-35)", async () => {
    expect(htmlRegistro).toMatch(/type="checkbox"/);
  });
  test.fail("CP-25 V02 · El registro enlaza la política de privacidad (INC-35)", async () => {
    expect(htmlRegistro).toMatch(/politica-privacidad/);
  });
  test.fail("CP-25 V03 · El registro informa la finalidad del tratamiento (INC-35)", async () => {
    expect(textoRegistro).toMatch(/finalidad|tratamiento de (tus|sus) datos/i);
  });
  test.fail("CP-25 V04 · La política de privacidad es accesible sin iniciar sesión (INC-35)", async ({ page }) => {
    await page.goto("/politica-privacidad");
    await expect(page.getByRole("heading", { name: "Política de Privacidad" })).toBeVisible({ timeout: 5000 });
  });
});

test.describe("CP-25 · Contenido de la política de privacidad", () => {
  test("CP-25 V05 · La política es accesible para el usuario autenticado", async () => {
    expect(textoPolitica).toContain("Política de Privacidad");
  });
  for (const [v, nombre, regex] of [
    ["V06", "derecho de acceso", /Acceder a su información/i],
    ["V07", "derecho de rectificación", /Corregir información/i],
    ["V08", "derecho de supresión", /eliminación de su información/i],
    ["V09", "plazo de retención", /Retención de Datos/i],
    ["V10", "cifrado de los datos", /Encriptación/i],
  ]) {
    test(`CP-25 ${v} · Informa el ${nombre}`, async () => {
      expect(textoPolitica).toMatch(regex);
    });
  }
  for (const [v, nombre, regex] of [
    ["V11", "las leyes aplicables (19.628, 21.719 y 20.584)", /19\.628|21\.719|20\.584/],
    ["V12", "el derecho de oposición", /oposici[oó]n/i],
    ["V13", "el derecho de portabilidad", /portabilidad/i],
    ["V14", "el responsable del tratamiento", /responsable del tratamiento/i],
    ["V15", "el procedimiento ante brechas de seguridad", /brecha|incidente de seguridad|vulneraci[oó]n/i],
  ]) {
    test.fail(`CP-25 ${v} · Informa ${nombre} (INC-36)`, async () => {
      expect(textoPolitica).toMatch(regex);
    });
  }
});

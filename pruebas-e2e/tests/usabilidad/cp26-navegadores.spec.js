// CP-26 · Compatibilidad con navegadores modernos (NFR-COMPAT-1)
// Se ejecuta en los proyectos chrome, firefox, webkit (motor de Safari) y msedge (si está instalado).
const { test, expect } = require("@playwright/test");
const { iniciarSesionComo } = require("../apoyo");

test.describe.serial("CP-26 · Flujo login → Mis Resultados en el navegador", () => {
  const errores = [];
  const recursos = []; // avisos de carga de recursos (no son errores de JavaScript de la aplicación)
  let page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      if (/401|Failed to load resource|downloadable font/.test(m.text())) recursos.push(m.text());
      else errores.push(m.text());
    });
  });
  test.afterAll(async () => page.close());

  test("CP-26 · El flujo login → Mis Resultados se completa", async ({ browserName }, testInfo) => {
    await iniciarSesionComo(page, "paciente");
    await page.goto("/mis-resultados");
    await expect(page.getByText("Mis Resultados Médicos")).toBeVisible();
    await testInfo.attach(`mis-resultados-${testInfo.project.name}-${browserName}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
  test("CP-26 · No se registran errores de JavaScript en la consola", () => {
    if (recursos.length) test.info().annotations.push({ type: "avisos de carga de recursos (no JS)", description: recursos.join(" | ").slice(0, 500) });
    expect(errores).toEqual([]);
  });
  test("CP-26 · La interfaz se muestra sin defectos visuales (sin desborde y con el contenido principal visible)", async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });
});

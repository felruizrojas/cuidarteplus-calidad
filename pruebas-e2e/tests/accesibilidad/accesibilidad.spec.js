// PRUEBAS DE ACCESIBILIDAD (NFR-USAB-1, ERS 3.1.1): reglas WCAG 2.1 A y AA con axe-core
// y mediciones para adultos mayores (fuente base y tamaño de controles).
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { iniciarSesionComo } = require("../apoyo");

async function analizar(page, nombre) {
  const resultado = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  // Se muestra en consola todo lo encontrado, para el informe
  for (const v of resultado.violations) {
    console.log(`[axe][${nombre}] [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elementos)`);
  }
  return resultado.violations;
}

const paginasPublicas = [
  ["login", "/login"],
  ["registro", "/registro"],
];

for (const [nombre, ruta] of paginasPublicas) {
  test(`NFR-USAB-1 · La página de ${nombre} no tiene problemas críticos de accesibilidad`, async ({ page }) => {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    const violaciones = await analizar(page, nombre);
    expect(violaciones.filter((v) => v.impact === "critical")).toEqual([]);
  });
}

test("NFR-USAB-1 · El panel del paciente y 'Mis resultados' no tienen problemas críticos", async ({ page }) => {
  await iniciarSesionComo(page, "paciente");
  const enHome = await analizar(page, "home-paciente");
  await page.goto("/mis-resultados");
  await expect(page.getByText("Mis Resultados Médicos")).toBeVisible();
  const enResultados = await analizar(page, "mis-resultados");
  expect([...enHome, ...enResultados].filter((v) => v.impact === "critical")).toEqual([]);
});

// ---------------------------------------------------------------------------
// Defectos conocidos (INC-44 e INC-45). test.fail(): la prueba exige lo que pide
// el ERS para adultos mayores y hoy falla; Playwright la informa como "esperada".
// Cuando se corrija, Playwright avisará para convertirla en una prueba normal.
// ---------------------------------------------------------------------------
test("INC-44 · El login cumple el contraste mínimo 4,5:1 (WCAG 1.4.3)", async ({ page }) => {
  test.fail(true, "Defecto conocido INC-44: contraste insuficiente en botones y enlaces");
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const violaciones = await analizar(page, "login-contraste");
  expect(violaciones.filter((v) => v.id === "color-contrast")).toEqual([]);
});

test("INC-45 · Fuente base de al menos 16 px y botón de ingreso de al menos 44 px de alto", async ({ page }) => {
  test.fail(true, "Defecto conocido INC-45: fuente base de 14 px y controles bajo 44 px");
  await page.goto("/login");
  const fuente = await page.getByTestId("input-nombre-usuario").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const alto = (await page.getByTestId("button-login").boundingBox()).height;
  console.log(`[medición] fuente del campo usuario = ${fuente}px · alto del botón Entrar = ${alto}px`);
  expect(fuente).toBeGreaterThanOrEqual(16);
  expect(alto).toBeGreaterThanOrEqual(44);
});

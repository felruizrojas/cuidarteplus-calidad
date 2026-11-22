// CP-08 · Legibilidad, contraste y tamaño de controles (WCAG 2.1 AA) (NFR-USAB-1, NFR-COMPAT-2)
// Herramientas: Playwright + axe-core (@axe-core/playwright) con las reglas WCAG 2.1 A y AA.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { iniciarSesionComo } = require("../apoyo");

const VISTAS = [
  ["login", "/login", null],
  ["home", "/home", "paciente"],
  ["mis-resultados", "/mis-resultados", "paciente"],
];

async function abrir(page, ruta, rol) {
  if (rol) await iniciarSesionComo(page, rol);
  await page.goto(ruta);
  await page.waitForLoadState("networkidle");
}

async function axe(page, nombre) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const resumen = r.violations.map((v) => `[${v.impact}] ${v.id} (${v.nodes.length})`).join(" · ") || "sin violaciones";
  test.info().annotations.push({ type: `axe-core ${nombre}`, description: resumen });
  await test.info().attach(`axe-core-${nombre}.json`, { body: JSON.stringify(r.violations, null, 2), contentType: "application/json" });
  return r.violations;
}

const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const [nombre, ruta, rol] of VISTAS) {
  test(`CP-08 · axe-core: ${nombre} sin violaciones críticas (WCAG 2.1 A/AA)`, async ({ page }) => {
    await abrir(page, ruta, rol);
    expect((await axe(page, nombre)).filter((v) => v.impact === "critical")).toEqual([]);
  });
  test.fail(`CP-08 · axe-core: ${nombre} sin errores de contraste 4,5:1 (INC-44)`, async ({ page }) => {
    await abrir(page, ruta, rol);
    expect((await axe(page, nombre)).filter((v) => v.id === "color-contrast")).toEqual([]);
  });
  test(`CP-08 · Zoom al 200 %: ${nombre} sigue operable y sin desborde horizontal`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 683, height: 450 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await abrir(page, ruta, rol);
    expect(await desborde(page)).toBeLessThanOrEqual(1);
    await ctx.close();
  });
}

test.fail("CP-08 · La fuente base es de al menos 16 px (INC-45)", async ({ page }) => {
  await abrir(page, "/login", null);
  const fuente = await page.getByTestId("input-nombre-usuario").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  test.info().annotations.push({ type: "fuente base (px)", description: String(fuente) });
  expect(fuente).toBeGreaterThanOrEqual(16);
});

test.fail("CP-08 · Los controles miden al menos 44×44 px (INC-45)", async ({ page }) => {
  await abrir(page, "/home", "paciente");
  const pequenos = await page.locator("button:visible, a:visible, input:visible").evaluateAll((els) =>
    els.map((e) => ({ t: (e.innerText || e.getAttribute("aria-label") || e.name || e.tagName).trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.height < 44 || x.r.width < 44)).map((x) => `${x.t} (${Math.round(x.r.width)}×${Math.round(x.r.height)})`)
  );
  test.info().annotations.push({ type: "controles bajo 44 px", description: pequenos.slice(0, 10).join(" · ") });
  expect(pequenos).toEqual([]);
});

test("CP-08 · Navegación por teclado con foco visible en el formulario de ingreso", async ({ page }) => {
  await abrir(page, "/login", null);
  await page.getByTestId("input-nombre-usuario").focus();
  await page.keyboard.press("Tab");
  const foco = await page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    const p = el.closest(".MuiOutlinedInput-root");
    const sp = p ? getComputedStyle(p.querySelector("fieldset") || p) : s;
    return { tag: el.tagName, visible: s.outlineStyle !== "none" || sp.borderWidth !== "1px" || /Mui-focused/.test(p?.className || "") };
  });
  expect(foco.tag).toBe("INPUT");
  expect(foco.visible).toBe(true);
});

for (const [dispositivo, ancho, alto] of [["móvil", 375, 812], ["tablet", 768, 1024], ["escritorio", 1366, 900]]) {
  test(`CP-08 · Diseño responsivo en ${dispositivo} (${ancho} px) sin desborde horizontal`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
    const page = await ctx.newPage();
    await abrir(page, "/mis-resultados", "paciente");
    expect(await desborde(page)).toBeLessThanOrEqual(1);
    await ctx.close();
  });
}

test("CP-08 · Los campos del formulario de ingreso tienen etiqueta accesible (WCAG 1.3.1 / 4.1.2)", async ({ page }) => {
  await abrir(page, "/login", null);
  const v = await axe(page, "login-etiquetas");
  expect(v.filter((x) => x.id === "label" || x.id === "aria-input-field-name")).toEqual([]);
});

test("CP-08 · El documento declara el idioma de la página (WCAG 3.1.1)", async ({ page }) => {
  await abrir(page, "/login", null);
  expect(await page.getAttribute("html", "lang")).toBeTruthy();
});

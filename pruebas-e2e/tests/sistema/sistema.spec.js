// PRUEBAS DE SISTEMA (caja negra): Cuidarte+ completo funcionando,
// frontend + backend + base de datos, usado como lo haría una persona.
const { test, expect } = require("@playwright/test");
const { iniciarSesion } = require("../apoyo");

test("CP-01 · La página de inicio de sesión carga correctamente", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toBeVisible();
  await expect(page.getByTestId("input-nombre-usuario")).toBeVisible();
  await expect(page.getByTestId("input-password")).toBeVisible();
});

test("CP-01 · Credenciales incorrectas muestran un mensaje y no dan acceso", async ({ page }) => {
  await iniciarSesion(page, "admin", "clave-equivocada");
  await expect(page.getByText("Credenciales inválidas").first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("NFR-SEG-4 · Una ruta protegida sin sesión redirige al login", async ({ page }) => {
  await page.goto("/pacientes");
  await expect(page).toHaveURL(/\/login/);
});

test("CP-16 · El formulario de autorregistro está disponible para un visitante", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("link-registro").click();
  await expect(page).toHaveURL(/\/registro/);
  await expect(page.getByTestId("input-registro-correo")).toBeVisible();
});

test("NFR-COMPAT-2 · La página de login se adapta al ancho de la pantalla (sin desplazamiento horizontal)", async ({ page }) => {
  await page.goto("/login");
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desborde).toBeLessThanOrEqual(1);
});

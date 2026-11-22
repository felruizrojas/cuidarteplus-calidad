// PRUEBAS DE ACEPTACIÓN: cada prueba corresponde a un criterio de aceptación
// escrito en el ERS de Cuidarte+. Formato: Dado / Cuando / Entonces.
const { test, expect } = require("@playwright/test");
const { iniciarSesion, iniciarSesionComo } = require("../apoyo");

test("CA-RF1-a · Un login exitoso abre la sesión y muestra el panel", async ({ page }) => {
  // Dado un usuario registrado (paciente)
  // Cuando ingresa sus credenciales correctas
  await iniciarSesion(page, "paciente", "paciente");
  // Entonces entra al panel principal y ve su nombre
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText("Bienvenido")).toBeVisible();
  // y el sistema guardó un token de sesión JWT
  const token = await page.evaluate(() => Object.values(localStorage).find((v) => /^ey/.test(v)) || "");
  expect(token.split(".")).toHaveLength(3);
});

test("CA-RF1-b · El cierre de sesión invalida el acceso a páginas protegidas", async ({ page }) => {
  // Dado un usuario con sesión iniciada
  await iniciarSesionComo(page, "medico");
  // Cuando cierra la sesión desde el menú de usuario
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  // Entonces vuelve al login y ya no puede entrar a páginas protegidas
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/pacientes");
  await expect(page).toHaveURL(/\/login/);
});

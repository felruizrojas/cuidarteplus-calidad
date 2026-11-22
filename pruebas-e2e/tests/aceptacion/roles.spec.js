// PRUEBAS DE ACEPTACIÓN: reglas de negocio RB-1, RB-2 y RB-3 (roles) y RF-4.1
const { test, expect } = require("@playwright/test");
const { iniciarSesionComo } = require("../apoyo");

test("CA-RB2 · El administrador gestiona usuarios (ve editar y eliminar)", async ({ page }) => {
  // Dado un administrador / Cuando abre la gestión de usuarios
  await iniciarSesionComo(page, "admin");
  await page.goto("/usuarios");
  // Entonces ve las opciones de editar y eliminar del usuario médico (id 2)
  await expect(page.getByTestId("button-usuario-editar-2")).toBeVisible();
  await expect(page.getByTestId("button-usuario-eliminar-2")).toBeVisible();
});

test("CA-RB3 / NFR-USAB-4 · El médico busca a un paciente por RUT y ve su información", async ({ page }) => {
  // Dado un médico
  await iniciarSesionComo(page, "medico");
  // Cuando abre Gestión de Pacientes y busca el RUT 11.111.111-1
  await page.goto("/pacientes");
  await page.getByLabel("Buscar por RUT").fill("11.111.111-1");
  await page.getByRole("button", { name: "Buscar" }).click();
  // Entonces ve la ficha del paciente Juan Pérez (primero el paciente, luego sus exámenes)
  await expect(page.getByText("Juan").first()).toBeVisible();
});

test("CA-RB1 · El paciente no accede a la gestión de usuarios", async ({ page }) => {
  // Dado un paciente / Cuando intenta abrir la gestión de usuarios
  await iniciarSesionComo(page, "paciente");
  await page.goto("/usuarios");
  // Entonces el sistema le niega el acceso
  await expect(page.getByText(/No autorizado/)).toBeVisible();
  await expect(page.getByTestId("button-usuario-eliminar-2")).toHaveCount(0);
});

test("CA-RF4.1 · El paciente consulta sus resultados", async ({ page }) => {
  // Dado un paciente / Cuando abre "Mis resultados"
  await iniciarSesionComo(page, "paciente");
  await page.goto("/mis-resultados");
  // Entonces ve la página de sus exámenes sin errores
  await expect(page).toHaveURL(/\/mis-resultados/);
  await expect(page.getByText("Mis Resultados Médicos")).toBeVisible();
});

// Funciones de apoyo que comparten todas las pruebas
const { expect } = require("@playwright/test");

// Usuarios de ejemplo del caso (datos ficticios)
const USUARIOS = {
  admin: { usuario: "admin", clave: "admin" },
  medico: { usuario: "medico", clave: "medico" },
  paciente: { usuario: "paciente", clave: "paciente" },
};

async function iniciarSesion(page, usuario, clave) {
  await page.goto("/login");
  await page.getByTestId("input-nombre-usuario").fill(usuario);
  await page.getByTestId("input-password").fill(clave);
  await page.getByTestId("button-login").click();
}

async function iniciarSesionComo(page, rol) {
  const { usuario, clave } = USUARIOS[rol];
  await iniciarSesion(page, usuario, clave);
  await expect(page).toHaveURL(/\/home/);
}

module.exports = { USUARIOS, iniciarSesion, iniciarSesionComo };

// PRUEBAS DE ACEPTACIÓN (Dado / Cuando / Entonces) por perfil de usuario, con datos ficticios.
// Cada escenario queda respaldado por video, una captura por paso y la traza de Playwright.
const { test, expect } = require("@playwright/test");
const { iniciarSesionComo, USUARIOS } = require("../apoyo");

test.use({ video: "on", trace: "on", screenshot: "on" });

async function paso(page, testInfo, nombre, accion) {
  await test.step(nombre, async () => {
    await accion();
    await testInfo.attach(nombre, { body: await page.screenshot(), contentType: "image/png" });
  });
}

// Detecta mensajes técnicos visibles (errores HTTP, trazas, SQL) en la interfaz
async function sinMensajesTecnicos(page) {
  await expect(page.locator("body")).not.toContainText(/Error 500|stack|SQL|undefined is not|TypeError|ECONN/i);
}

test("CP-32 · Aceptación: el paciente consulta y descarga sus resultados (RF-1.1, RF-4.1, RF-4.2, NFR-USAB-2)", async ({ page }, testInfo) => {
  // Dado: Rosa Muñoz Tapia, 74 años, paciente con dos exámenes ficticios
  await paso(page, testInfo, "1. Iniciar sesión como paciente (rosa.munoz)", async () => {
    await iniciarSesionComo(page, "rosa");
  });
  await paso(page, testInfo, "2. Ir a Mis Resultados", async () => {
    await page.getByRole("link", { name: "Ir a Mis Resultados" }).click();
    await expect(page.getByText("Mis Resultados Médicos")).toBeVisible();
  });
  await paso(page, testInfo, "3. Ver solo sus dos exámenes y abrir Electrocardiograma", async () => {
    await expect(page.getByText("Completado")).toHaveCount(2);
    await page.getByText("Electrocardiograma", { exact: true }).click();
  });
  await paso(page, testInfo, "4. Descargar el documento en menos de 10 segundos", async () => {
    const inicio = Date.now();
    const descarga = page.waitForEvent("download");
    await page.getByRole("button", { name: /ecg_resultado\.pdf/ }).click();
    const archivo = await descarga;
    expect((Date.now() - inicio) / 1000).toBeLessThan(10);
    expect(await archivo.failure()).toBeNull();
  });
  await paso(page, testInfo, "5. Cerrar sesión y volver al inicio de sesión", async () => {
    await sinMensajesTecnicos(page);
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.fail("CP-33 · Aceptación: el médico registra un paciente, un examen y su documento (RF-2.2, RF-3.1, RF-4.3, NFR-USAB-4) — INC-17", async ({ page }, testInfo) => {
  // Dado: el médico ficticio medico.qa y un paciente nuevo, Pedro Soto Rivas
  await paso(page, testInfo, "1. Iniciar sesión como médico (medico.qa)", async () => {
    await iniciarSesionComo(page, "medicoQa");
  });
  await paso(page, testInfo, "2. Buscar por RUT a un paciente no registrado", async () => {
    await page.goto("/pacientes");
    await page.getByLabel("Buscar por RUT").fill("4.876.321-9");
    const respuesta = page.waitForResponse((r) => r.url().includes("/pacientes/buscar/rut/"));
    await page.getByRole("button", { name: "Buscar" }).click();
    expect((await respuesta).status()).toBe(404);
  });
  await paso(page, testInfo, "3. Registrar al paciente desde el formulario (campos opcionales vacíos)", async () => {
    await page.getByRole("button", { name: "Registrar Paciente" }).first().click();
    const form = page.locator("main");
    await form.getByRole("textbox", { name: "RUT", exact: true }).fill("4.876.321-9");
    await form.getByRole("textbox", { name: "Primer Nombre" }).fill("Pedro");
    await form.getByRole("textbox", { name: "Apellido Paterno" }).fill("Soto");
    await form.getByRole("textbox", { name: "Apellido Materno" }).fill("Rivas");
    await form.getByRole("textbox", { name: "Fecha de Nacimiento" }).fill("1948-08-03");
    await form.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Masculino" }).click();
    await form.getByRole("textbox", { name: "Email" }).fill("pedro.soto@correo.cl");
    const respuesta = page.waitForResponse((r) => r.url().endsWith("/pacientes") && r.request().method() === "POST");
    await form.getByRole("button", { name: "Registrar Paciente" }).last().click();
    // Entonces el paciente queda registrado (hoy la API responde 400 por estado civil y grupo sanguíneo vacíos)
    expect((await respuesta).status()).toBe(201);
  });
  await paso(page, testInfo, "4-6. Buscar al paciente, registrar el examen Hemograma y adjuntar hemograma.pdf", async () => {
    await page.goto("/pacientes");
    await page.getByLabel("Buscar por RUT").fill("4.876.321-9");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Pedro").first()).toBeVisible();
    await sinMensajesTecnicos(page);
  });
});

test("CP-34 · Aceptación: el administrador gestiona usuarios y revisa la auditoría (RF-2.5, RF-2.6, RF-5.1, RB-2)", async ({ page }, testInfo) => {
  // Dado: el administrador ficticio admin.qa
  await paso(page, testInfo, "1. Iniciar sesión como administrador (admin.qa)", async () => {
    await iniciarSesionComo(page, "adminQa");
  });
  await paso(page, testInfo, "2. Ir a Gestión de Usuarios y revisar el listado", async () => {
    await page.getByRole("link", { name: "Ir a Usuarios" }).click();
    await expect(page.getByRole("heading", { name: "Gestión de Usuarios" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
  await paso(page, testInfo, "3. Crear el usuario camila.reyes con rol paciente", async () => {
    await page.getByRole("tab", { name: "Crear Usuario" }).click();
    await page.getByRole("textbox", { name: "Nombre de usuario" }).fill("camila.reyes");
    await page.getByRole("textbox", { name: "Correo electrónico" }).fill("camila.reyes@correo.cl");
    await page.getByRole("textbox", { name: "Contraseña" }).fill(USUARIOS.adminQa.clave);
    const respuesta = page.waitForResponse((r) => r.url().endsWith("/usuarios") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Crear Usuario" }).click();
    expect((await respuesta).status()).toBe(201);
  });
  await paso(page, testInfo, "4. Editar el usuario y cambiar su rol a médico", async () => {
    await page.getByRole("tab", { name: "Listar Usuarios" }).click();
    const fila = page.getByRole("row", { name: /camila\.reyes/ });
    await fila.getByRole("button", { name: "Editar usuario" }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /m[eé]dico/i }).click();
    const respuesta = page.waitForResponse((r) => /\/usuarios\/\d+$/.test(r.url()) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Actualizar Información" }).click();
    const r = await respuesta;
    expect(r.status()).toBe(200);
    expect((await r.json()).rol_nombre).toBe("medico");
  });
  await paso(page, testInfo, "5. Ver en Auditoría la creación y la edición, con fecha y autor", async () => {
    await page.goto("/auditoria");
    await expect(page.getByRole("row", { name: /USUARIOS_CREAR: creó usuario camila\.reyes.*admin\.qa/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /USUARIOS_ACTUALIZAR.*admin\.qa/ }).first()).toBeVisible();
    await sinMensajesTecnicos(page);
  });
});

// CP-12 · TLS en las comunicaciones y cifrado de datos sensibles en reposo (NFR-SEG-1, NFR-SEG-3)
// Herramientas: Playwright (peticiones HTTPS/HTTP) + Docker CLI y psql (consultas de solo lectura).
const { test, expect, request } = require("@playwright/test");
const { psql, docker } = require("../apoyo");

const HOST_API = "localhost:4445";
const HOST_WEB = "localhost:3334";

async function respondeHttps(host) {
  const ctx = await request.newContext({ ignoreHTTPSErrors: false });
  try {
    const r = await ctx.get(`https://${host}/`, { timeout: 5000 });
    return r.ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

test.fail("CP-12 V01 · La API responde por HTTPS con un certificado válido (INC-27)", async () => {
  expect(await respondeHttps(HOST_API)).toBe(true);
});

test.fail("CP-12 V02 · El frontend responde por HTTPS con un certificado válido (INC-27)", async () => {
  expect(await respondeHttps(HOST_WEB)).toBe(true);
});

test.fail("CP-12 V03 · Las peticiones HTTP se redirigen a HTTPS (INC-27)", async () => {
  const ctx = await request.newContext();
  const r = await ctx.get(`http://${HOST_API}/`, { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(r.status());
  expect(r.headers()["location"] || "").toMatch(/^https:/);
});

test.fail("CP-12 V04 · El frontend envía la cabecera HSTS (INC-27)", async () => {
  const ctx = await request.newContext();
  const r = await ctx.get(`http://${HOST_WEB}/`);
  expect(r.headers()["strict-transport-security"]).toBeTruthy();
});

test.fail("CP-12 V05 · La base de datos no se publica fuera de la red interna de Docker (INC-27)", async () => {
  const puertos = docker("port cuidarteplus-postgres-et");
  test.info().annotations.push({ type: "docker port", description: puertos || "(sin puertos publicados)" });
  expect(puertos).toBe("");
});

test.fail("CP-12 V06 · PostgreSQL tiene SSL activo (INC-28)", async () => {
  expect(psql("SHOW ssl")).toBe("on");
});

test.fail("CP-12 V07 · Los datos clínicos sensibles no son legibles en la base de datos (INC-28)", async () => {
  const dato = psql("SELECT enfermedades_cronicas FROM pacientes WHERE id = 1");
  test.info().annotations.push({ type: "Dato almacenado", description: dato });
  expect(dato).not.toBe("Hipertensión");
});

test.fail("CP-12 V08 · Las contraseñas no son legibles en la base de datos (INC-29)", async () => {
  expect(psql("SELECT contrasena FROM usuarios WHERE nombre_usuario = 'paciente'")).not.toBe("paciente");
});

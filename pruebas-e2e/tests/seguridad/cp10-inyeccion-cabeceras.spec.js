// CP-10 · Protección contra XSS, SQL Injection, CSRF y validación de entrada (NFR-SEG-5)
// Herramientas: Playwright (cargas maliciosas, CORS, cabeceras, asignación masiva) + OWASP ZAP (reportes/zap).
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { API, nuevaApi, token, auth, crearPaciente, psql, rutValido, sufijo, iniciarSesionComo } = require("../apoyo");

const SQLI = "' OR '1'='1";
const XSS = "<script>alert(1)</script>";
const FRONT = process.env.BASE_URL || "http://localhost:3334";
let api, tMedico, cabApi, cabWeb;

test.beforeAll(async () => {
  api = await nuevaApi();
  tMedico = await token(api, "medico", "medico");
  cabApi = (await api.get("/", { headers: { Origin: "https://dominio-externo.example" } })).headers();
  cabWeb = (await api.get(FRONT)).headers();
});

test.fail("CP-10 V01 · Inyección SQL en el identificador no produce errores HTTP 500 (INC-20)", async () => {
  const r = await api.get(`/examenes/${encodeURIComponent(SQLI)}`, { headers: auth(tMedico) });
  expect(r.status()).not.toBe(500);
});

test("CP-10 V02 · Inyección SQL en la búsqueda por RUT no altera la consulta ni devuelve datos", async () => {
  const r = await api.get(`/pacientes/buscar/rut/${encodeURIComponent(SQLI)}`, { headers: auth(tMedico) });
  expect(r.status()).toBe(404);
});

test("CP-10 V03 · La carga XSS se muestra escapada y no se ejecuta en el navegador", async ({ page }) => {
  const rut = rutValido();
  await crearPaciente(api, tMedico, { rut, primer_nombre: XSS.slice(0, 50), email: `xss.${sufijo()}@correo.cl` });
  let alertaEjecutada = false;
  page.on("dialog", async (d) => { alertaEjecutada = true; await d.dismiss(); });
  await iniciarSesionComo(page, "medico");
  await page.goto("/pacientes");
  await page.getByLabel("Buscar por RUT").fill(rut);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("<script>").first()).toBeVisible();
  expect(alertaEjecutada).toBe(false);
});

test("CP-10 V04 · CORS no autoriza orígenes externos (sin Access-Control-Allow-Origin: * ni el dominio externo)", async () => {
  expect(cabApi["access-control-allow-origin"]).not.toBe("*");
  expect(cabApi["access-control-allow-origin"]).not.toBe("https://dominio-externo.example");
});

test("CP-10 V05 · No se revela la tecnología del servidor (sin X-Powered-By)", async () => {
  expect(cabApi["x-powered-by"]).toBeUndefined();
});

test.fail("CP-10 V06 · Content-Security-Policy presente en la API y en el frontend (INC-21, CSP del frontend)", async () => {
  expect(cabApi["content-security-policy"]).toBeTruthy();
  expect(cabWeb["content-security-policy"]).toBeTruthy();
});

test("CP-10 V07 · X-Content-Type-Options: nosniff en la API y en el frontend", async () => {
  expect(cabApi["x-content-type-options"]).toBe("nosniff");
  expect(cabWeb["x-content-type-options"]).toBe("nosniff");
});

test("CP-10 V08 · X-Frame-Options presente en la API y en el frontend (anti-clickjacking)", async () => {
  expect(cabApi["x-frame-options"]).toBeTruthy();
  expect(cabWeb["x-frame-options"]).toBeTruthy();
});

test.fail("CP-10 V09 · Strict-Transport-Security (HSTS) presente en la API y en el frontend (INC-27)", async () => {
  expect(cabApi["strict-transport-security"]).toBeTruthy();
  expect(cabWeb["strict-transport-security"]).toBeTruthy();
});

test.fail("CP-10 V10 · El campo no declarado usuario_id se rechaza o se ignora en PUT /pacientes/:id (INC-19)", async () => {
  const paciente = await crearPaciente(api, tMedico);
  const r = await api.put(`/pacientes/${paciente.id}`, { headers: auth(tMedico), data: { telefono: "+56900000000", usuario_id: 1 } });
  const usuarioId = psql(`SELECT COALESCE(usuario_id::text,'NULL') FROM pacientes WHERE id = ${paciente.id}`);
  expect(r.status() === 400 || usuarioId === "NULL").toBe(true);
});

test("CP-10 V11 · OWASP ZAP no reporta alertas de riesgo alto ni medio (INC-21)", async () => {
  const dir = path.join(__dirname, "..", "..", "..", "reportes", "zap");
  const archivos = ["zap-web.json", "zap-api.json"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
  test.skip(archivos.length === 0, "Aún no existen los reportes de ZAP (se generan con zap-baseline.py y zap-api-scan.py)");
  test.fail(true, "Defecto conocido INC-21: ZAP reporta alertas de riesgo medio (CSP del frontend, SRI)");
  const alertas = archivos.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).site.flatMap((s) => s.alerts));
  const altasMedias = alertas.filter((a) => /^(High|Medium)/.test(a.riskdesc)).map((a) => `${a.riskdesc.split(" ")[0]}: ${a.name}`);
  test.info().annotations.push({ type: "ZAP alto/medio", description: altasMedias.join(" · ") || "ninguna" });
  expect(altasMedias).toEqual([]);
});

test.afterAll(() => {
  test.info().annotations.push({ type: "API", description: API });
});

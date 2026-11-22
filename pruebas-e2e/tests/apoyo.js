// Funciones de apoyo compartidas por las pruebas de Playwright
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const { expect, request: pwRequest } = require("@playwright/test");

const API = process.env.API_URL || "http://localhost:4445";
const PG = process.env.PG_CONTAINER || "cuidarteplus-postgres-et";
const CLAVE_QA = "Cuidarte2026!#";

// Cuentas ficticias del caso (las de "qa" las crea preparacion.setup.js)
const USUARIOS = {
  admin: { usuario: "admin", clave: "admin" },
  medico: { usuario: "medico", clave: "medico" },
  paciente: { usuario: "paciente", clave: "paciente" },
  rosa: { usuario: "rosa.munoz", clave: CLAVE_QA },
  medicoQa: { usuario: "medico.qa", clave: CLAVE_QA },
  adminQa: { usuario: "admin.qa", clave: CLAVE_QA },
};

const TIPO = { hemograma: 1, glicemia: 3, electrocardiograma: 11 };

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sufijo = () => `${Date.now()}${crypto.randomInt(1000)}`;

function dv(numero) {
  let suma = 0;
  let factor = 2;
  for (const d of String(numero).split("").reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
const numeroAleatorio = () => crypto.randomInt(10000000, 19000000);
const rutValido = () => { const n = numeroAleatorio(); return `${n}-${dv(n)}`; };
const rutConDvIncorrecto = () => { const n = numeroAleatorio(); return `${n}-${dv(n) === "0" ? "1" : "0"}`; };

// ---------- API ----------
async function nuevaApi() {
  return pwRequest.newContext({ baseURL: API });
}
async function token(api, usuario, clave) {
  const r = await api.post("/autenticacion/login", { data: { nombre_usuario: usuario, password: clave } });
  return (await r.json()).token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function crearPaciente(api, t, extra = {}) {
  const r = await api.post("/pacientes", {
    headers: auth(t),
    data: { rut: rutValido(), primer_nombre: "Ana", apellido_paterno: "Rojas", apellido_materno: "Díaz", fecha_nacimiento: "1950-05-10", sexo: "F", email: `ana.${sufijo()}@correo.cl`, ...extra },
  });
  return r.json();
}
async function crearExamen(api, t, pacienteId, tipo = TIPO.hemograma, diagnosis = "Control QA") {
  const r = await api.post("/examenes", { headers: auth(t), data: { tipo_examen_medico_id: tipo, paciente_id: pacienteId, diagnosis } });
  return { status: r.status(), body: await r.json() };
}
async function subirDocumento(api, t, examenId, pacienteId, nombre = "resultado_examen.pdf", buffer = PDF, mimeType = "application/pdf") {
  return api.post("/documentos", {
    headers: auth(t),
    multipart: { examen_medico_id: String(examenId), paciente_id: String(pacienteId), documentos: { name: nombre, mimeType, buffer } },
  });
}

// ---------- Interfaz ----------
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

// ---------- Base de datos y Docker (solo lectura salvo indicación) ----------
// Ruta absoluta del ejecutable de Docker (no se depende de la variable PATH)
const fs = require("fs");
const DOCKER = process.env.DOCKER_BIN || ["/usr/bin/docker", "/usr/local/bin/docker", "/opt/homebrew/bin/docker"].find((r) => fs.existsSync(r));
// Se usa execFileSync con argumentos separados: no pasa por la shell, así que no hay que escapar nada
const psql = (sql, db = "cuidarteplus") =>
  execFileSync(DOCKER, ["exec", PG, "psql", "-U", "postgres", "-d", db, "-tAc", sql], { encoding: "utf8" }).trim();
const docker = (cmd) => execFileSync(DOCKER, cmd.match(/(?:[^\s"]+|"[^"]*")+/g).map((a) => a.replace(/^"|"$/g, "")), { encoding: "utf8" }).trim();

module.exports = {
  API, USUARIOS, TIPO, CLAVE_QA, PDF, sha256, sufijo, dv, rutValido, rutConDvIncorrecto,
  nuevaApi, token, auth, crearPaciente, crearExamen, subirDocumento,
  iniciarSesion, iniciarSesionComo, psql, docker,
};

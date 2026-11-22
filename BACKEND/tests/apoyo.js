// Funciones de apoyo compartidas por las pruebas de integración y seguridad (Jest + Supertest)
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");

const sufijo = () => `${Date.now()}${crypto.randomInt(1000)}`;

// Dígito verificador de un RUT chileno (módulo 11)
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
const rutValido = () => {
  const n = numeroAleatorio();
  return `${n}-${dv(n)}`;
};
const rutConDvIncorrecto = () => {
  const n = numeroAleatorio();
  return `${n}-${dv(n) === "0" ? "1" : "0"}`;
};

// PDF mínimo válido (ficticio) para las pruebas de documentos
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);

async function iniciarSesion(usuario, clave) {
  const res = await request(app).post("/autenticacion/login").send({ nombre_usuario: usuario, password: clave });
  return res.body.token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function crearUsuario(tokenAdmin, rolId = 3) {
  const id = sufijo();
  const datos = { nombre_usuario: `qa_${id}`, contrasena_hash: "Cuidarte2026!#", correo: `qa_${id}@correo.cl`, rol_id: rolId };
  const res = await request(app).post("/usuarios").set(auth(tokenAdmin)).send(datos);
  return { ...res.body, clave: datos.contrasena_hash };
}

async function crearPaciente(token, extra = {}) {
  const res = await request(app)
    .post("/pacientes")
    .set(auth(token))
    .send({
      rut: rutValido(),
      primer_nombre: "Ana",
      apellido_paterno: "Rojas",
      apellido_materno: "Díaz",
      fecha_nacimiento: "1950-05-10",
      sexo: "F",
      email: `ana.${sufijo()}@correo.cl`,
      ...extra,
    });
  return res.body;
}

async function crearExamen(token, pacienteId, tipo = 1) {
  const res = await request(app)
    .post("/examenes")
    .set(auth(token))
    .send({ tipo_examen_medico_id: tipo, paciente_id: pacienteId, diagnosis: "Control QA" });
  return res.body;
}

async function subirDocumento(token, examenId, pacienteId, nombre = "resultado_examen.pdf", contenido = PDF, tipo = "application/pdf") {
  return request(app)
    .post("/documentos")
    .set(auth(token))
    .field("examen_medico_id", String(examenId))
    .field("paciente_id", String(pacienteId))
    .attach("documentos", contenido, { filename: nombre, contentType: tipo });
}

const claveAleatoria = () => `Qa-${crypto.randomBytes(9).toString("base64url")}9a!`;

// Registra un visitante con RUT (queda como paciente con ficha propia)
async function registrarPacienteConCuenta() {
  const id = sufijo();
  // Contraseña aleatoria generada en cada ejecución (no hay credenciales fijas en el código)
  const datos = { nombre_usuario: `pac_${id}`, password: claveAleatoria(), correo: `pac_${id}@correo.cl`, rut: rutValido() };
  await request(app).post("/autenticacion/registro").send(datos);
  const token = await iniciarSesion(datos.nombre_usuario, datos.password);
  return { ...datos, token };
}

module.exports = {
  app,
  request,
  sufijo,
  dv,
  rutValido,
  rutConDvIncorrecto,
  PDF,
  iniciarSesion,
  auth,
  crearUsuario,
  crearPaciente,
  crearExamen,
  subirDocumento,
  registrarPacienteConCuenta,
};

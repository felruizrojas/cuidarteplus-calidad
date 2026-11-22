// CP-04 · Storage interno con referencia en base de datos (RF-4.4)
// Herramienta: Jest + Supertest + PostgreSQL real.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../../src/db");
const { app, request, auth, PDF, iniciarSesion, crearExamen, subirDocumento, registrarPacienteConCuenta } = require("../apoyo");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
let documentoId;
let tokenMedico;

beforeAll(async () => {
  tokenMedico = await iniciarSesion("medico", "medico");
  const examen = await crearExamen(tokenMedico, 1, 11); // Electrocardiograma del paciente semilla
  const res = await subirDocumento(tokenMedico, examen.id, 1, "ecg_resultado.pdf");
  documentoId = res.body.documentos[0].id;
});
afterAll(() => pool.end());

describe("CP-04 · Storage interno con referencia en base de datos", () => {
  test.failing("CP-04 V01 · La base de datos guarda la referencia, no el binario (INC-05)", async () => {
    const fila = await pool.query("SELECT * FROM documentos_examen WHERE id = $1", [documentoId]);
    expect(Buffer.isBuffer(fila.rows[0].documento)).toBe(false);
  });

  test.failing("CP-04 V02 · El archivo físico existe en el storage interno (INC-05)", async () => {
    const carpeta = path.join(__dirname, "..", "..", "uploads", "documentos");
    const archivos = fs.readdirSync(carpeta).filter((f) => f !== ".gitkeep");
    expect(archivos.length).toBeGreaterThan(0);
  });

  test("CP-04 V03 · El documento descargado es idéntico al original (SHA-256)", async () => {
    const res = await request(app).get(`/documentos/${documentoId}`).set(auth(tokenMedico)).buffer(true)
      .parse((r, cb) => { const d = []; r.on("data", (c) => d.push(c)); r.on("end", () => cb(null, Buffer.concat(d))); });
    expect(res.status).toBe(200);
    expect(sha256(res.body)).toBe(sha256(PDF));
  });

  test("CP-04 V04 · La descarga sin token se rechaza (401)", async () => {
    const res = await request(app).get(`/documentos/${documentoId}`);
    expect(res.status).toBe(401);
  });

  test("CP-04 V05 · La descarga por un paciente ajeno se rechaza (403)", async () => {
    const ajeno = await registrarPacienteConCuenta();
    const res = await request(app).get(`/documentos/${documentoId}`).set(auth(ajeno.token));
    expect(res.status).toBe(403);
  });
});

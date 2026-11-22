const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

const { pool } = require("./db");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const pacientesRoutes = require("./routes/pacientes");
const examenesRoutes = require("./routes/examenes");
const documentosRoutes = require("./routes/documentos");
const tipoExamenRoutes = require("./routes/tipo-examen");
const auditRoutes = require("./routes/audit");
const rolesRoutes = require("./routes/roles");

const app = express();

// Encabezados de seguridad recomendados (hallazgos de OWASP ZAP y SonarQube S5689):
// CSP, anti-clickjacking, nosniff, HSTS, y elimina X-Powered-By.
app.use(helmet());
// CORS restringido al dominio del frontend (hallazgo de OWASP ZAP y SonarQube S5122, INC-21)
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3334" }));
app.use(express.json());
app.use(morgan("dev"));

const uploadsDir = path.join(__dirname, "..", "uploads", "documentos");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use("/autenticacion", authRoutes);
app.use("/usuarios", userRoutes);
app.use("/pacientes", pacientesRoutes);
app.use("/examenes", examenesRoutes);
app.use("/documentos", documentosRoutes);
app.use("/tipo-examen", tipoExamenRoutes);
app.use("/auditoria", auditRoutes);
app.use("/roles", rolesRoutes);

const openapi = require("./openapi.json");
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.get("/openapi.json", (req, res) => {
  res.json(openapi);
});

app.use("/files/documentos", express.static(uploadsDir));

app.get("/", (req, res) => {
  res.json({ name: "cuidarteplus", status: "ok" });
});

const PORT = process.env.PORT || 3000;

// Solo encendemos el servidor si este archivo se ejecuta directamente
// (node src/app.js). Cuando lo usan las pruebas (Supertest), no se enciende.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`cuidarteplus API escuchando en puerto ${PORT}`);
  });
}

module.exports = app;

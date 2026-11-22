// CP-24 · Respaldo, restauración y migración de datos (NFR-SEG-7, NFR-DIS-2)
// Herramienta: Jest + pg_dump / pg_restore ejecutados con Docker CLI en el contenedor de PostgreSQL.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CONTENEDOR = process.env.PG_CONTAINER || "cuidarteplus-postgres-et";
const RAIZ = path.join(__dirname, "..", "..", "..");
const psql = (db, sql) =>
  execSync(`docker exec ${CONTENEDOR} psql -U postgres -d ${db} -tAc "${sql}"`, { encoding: "utf8" }).trim();
const TABLAS = ["usuarios", "roles", "usuario_roles", "pacientes", "tipo_examen_medico", "examen_medico", "documentos_examen", "auditoria"];
const conteos = (db) => TABLAS.map((t) => `${t}=${psql(db, `SELECT COUNT(*) FROM ${t}`)}`).join(";");
const huellas = (db) => psql(db, "SELECT COALESCE(string_agg(md5(documento), ',' ORDER BY id), '') FROM documentos_examen");

function buscarEnRepositorio(regex, ignorar = /node_modules|\.git|reportes|coverage|playwright-report/) {
  const encontrados = [];
  const recorrer = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (ignorar.test(p)) continue;
      if (f.isDirectory()) recorrer(p);
      else if (regex.test(f.name)) encontrados.push(path.relative(RAIZ, p));
    }
  };
  recorrer(RAIZ);
  return encontrados;
}

let origen, restaurado, errorRestauracion = null;
beforeAll(() => {
  origen = { conteos: conteos("cuidarteplus"), huellas: huellas("cuidarteplus") };
  execSync(`docker exec ${CONTENEDOR} pg_dump -U postgres -Fc -f /tmp/respaldo.dump cuidarteplus`);
  execSync(`docker exec ${CONTENEDOR} psql -U postgres -c "DROP DATABASE IF EXISTS cuidarteplus_restore" -c "CREATE DATABASE cuidarteplus_restore"`);
  try {
    execSync(`docker exec ${CONTENEDOR} pg_restore -U postgres --exit-on-error -d cuidarteplus_restore /tmp/respaldo.dump`, { stdio: "pipe" });
  } catch (e) {
    errorRestauracion = String(e.stderr || e.message);
  }
  restaurado = { conteos: conteos("cuidarteplus_restore"), huellas: huellas("cuidarteplus_restore") };
});
afterAll(() => {
  execSync(`docker exec ${CONTENEDOR} psql -U postgres -c "DROP DATABASE IF EXISTS cuidarteplus_restore"`);
  execSync(`docker exec ${CONTENEDOR} rm -f /tmp/respaldo.dump`);
});

describe("CP-24 · Respaldo, restauración y migración de datos", () => {
  test.failing("CP-24 V01 · Existe una política de respaldo documentada o automatizada (INC-33)", () => {
    expect(buscarEnRepositorio(/backup|respaldo/i).filter((f) => !/tests?[\\/]/.test(f))).not.toEqual([]);
  });

  test("CP-24 V02 · El respaldo con pg_dump (formato custom) se genera", () => {
    expect(psql("cuidarteplus", "SELECT 1")).toBe("1");
  });

  test("CP-24 V03 · El respaldo se restaura sin errores con pg_restore", () => {
    expect(errorRestauracion).toBeNull();
  });

  test("CP-24 V04 · Los conteos de cada tabla son idénticos entre origen y restauración", () => {
    expect(restaurado.conteos).toBe(origen.conteos);
  });

  test("CP-24 V05 · La huella MD5 de los documentos es idéntica", () => {
    expect(restaurado.huellas).toBe(origen.huellas);
  });

  test.failing("CP-24 V06 · Existe una herramienta de migraciones versionadas (INC-34)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "BACKEND", "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.some((d) => /migrate|knex|sequelize|typeorm|prisma|flyway/i.test(d))).toBe(true);
  });
});

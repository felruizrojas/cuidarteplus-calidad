// CP-28 · Recuperación tras reinicio del backend (NFR-DIS-1, NFR-DIS-2)
// Herramientas: Playwright + Docker CLI. Se ejecuta al final (proyecto "resiliencia") porque reinicia la API.
const { test, expect, request } = require("@playwright/test");
const { API, docker } = require("../apoyo");

const CONTENEDORES = ["cuidarteplus-backend-et", "cuidarteplus-frontend-et", "cuidarteplus-postgres-et"];

async function segundosHastaResponder(maximo = 30) {
  const ctx = await request.newContext({ baseURL: API });
  const inicio = Date.now();
  while ((Date.now() - inicio) / 1000 < maximo) {
    try {
      if ((await ctx.get("/", { timeout: 1000 })).status() === 200) return (Date.now() - inicio) / 1000;
    } catch { /* aún no responde */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return Infinity;
}

test.describe.serial("CP-28 · Recuperación tras reinicio del backend", () => {
  test("CP-28 V01 · Todos los contenedores tienen una política de reinicio automático", () => {
    const politicas = CONTENEDORES.map((c) => `${c}=${docker(`inspect -f "{{.HostConfig.RestartPolicy.Name}}" ${c}`)}`);
    test.info().annotations.push({ type: "políticas", description: politicas.join(" · ") });
    expect(politicas.every((p) => /=(unless-stopped|always|on-failure)$/.test(p))).toBe(true);
  });

  test.fail("CP-28 V02 · Todos los servicios tienen un healthcheck definido (INC-41)", () => {
    const sinHealthcheck = CONTENEDORES.filter((c) => docker(`inspect -f "{{if .Config.Healthcheck}}si{{else}}no{{end}}" ${c}`) !== "si");
    test.info().annotations.push({ type: "sin healthcheck", description: sinHealthcheck.join(", ") || "ninguno" });
    expect(sinHealthcheck).toEqual([]);
  });

  test("CP-28 V03 · Tras un reinicio controlado, el backend vuelve a responder en pocos segundos", async () => {
    docker("restart cuidarteplus-backend-et");
    const s = await segundosHastaResponder();
    test.info().annotations.push({ type: "segundos hasta responder", description: s.toFixed(1) });
    expect(s).toBeLessThan(15);
  });

  test("CP-28 V04 · Tras una caída del proceso, Docker lo reinicia solo y la API vuelve a responder", async () => {
    // Caída real: se termina el proceso de Node con SIGKILL desde el espacio de procesos del host
    // (desde dentro del contenedor el kernel ignora las señales dirigidas al PID 1).
    const antes = Number(docker('inspect -f "{{.RestartCount}}" cuidarteplus-backend-et'));
    const pid = docker('inspect -f "{{.State.Pid}}" cuidarteplus-backend-et');
    docker(`run --rm --pid=host --entrypoint kill postgres:15-alpine -9 ${pid}`);
    const s = await segundosHastaResponder();
    const despues = Number(docker('inspect -f "{{.RestartCount}}" cuidarteplus-backend-et'));
    test.info().annotations.push({ type: "segundos hasta responder", description: s.toFixed(1) });
    test.info().annotations.push({ type: "reinicios automáticos", description: `${antes} → ${despues}` });
    expect(despues).toBeGreaterThan(antes);
    expect(s).toBeLessThan(15);
  });
});

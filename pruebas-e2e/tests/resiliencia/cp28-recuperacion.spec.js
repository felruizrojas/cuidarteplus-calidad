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
    try { docker("exec cuidarteplus-backend-et kill 1"); } catch { /* el contenedor se detiene al terminar el proceso */ }
    await new Promise((r) => setTimeout(r, 1000));
    const s = await segundosHastaResponder();
    test.info().annotations.push({ type: "segundos hasta responder", description: s.toFixed(1) });
    expect(s).toBeLessThan(15);
  });
});

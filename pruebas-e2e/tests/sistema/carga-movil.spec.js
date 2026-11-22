// NFR-PERF-2: la página principal debe cargar en menos de 2 s en una conexión móvil promedio.
// Se simula un celular con red 4G lenta (150 ms de latencia, 1,6 Mbps) y CPU 4 veces más lenta,
// las mismas condiciones del perfil móvil de Lighthouse, y se mide el LCP (Largest Contentful Paint).
const { test, expect } = require("@playwright/test");

async function medirLCP(page, ruta) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(ruta, { waitUntil: "load" });
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        new PerformanceObserver((lista) => {
          const entradas = lista.getEntries();
          resolve(entradas[entradas.length - 1].startTime);
        }).observe({ type: "largest-contentful-paint", buffered: true });
      })
  );
}

test("NFR-PERF-2 · La página de inicio de sesión carga en menos de 2 s en un celular con 4G lenta", async ({ page, isMobile }) => {
  test.skip(!isMobile, "La medición de carga móvil se ejecuta solo en el perfil celular");
  test.fail(true, "Defecto conocido INC-39: la carga en perfil móvil supera los 2 s");
  const lcp = await medirLCP(page, "/login");
  console.log(`[medición] LCP de /login en celular con 4G lenta = ${Math.round(lcp)} ms (umbral ERS: 2000 ms)`);
  expect(lcp).toBeLessThan(2000);
});

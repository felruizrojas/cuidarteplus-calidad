// CP-15 (parte frontend) · La página principal carga en menos de 2 s en una conexión móvil promedio (NFR-PERF-2).
// Perfil móvil equivalente al de Lighthouse: Pixel 7, red 4G lenta (150 ms, 1,6 Mbps) y CPU 4 veces más lenta.
// Se mide el LCP (Largest Contentful Paint). La parte de 200 usuarios concurrentes se mide con k6 (cp15-concurrencia.js).
const { test, expect, devices } = require("@playwright/test");
const { iniciarSesionComo } = require("../apoyo");

test.use({ ...devices["Pixel 7"] });

async function medirLCP(page, ruta) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // Caché fría, como en la primera visita de un usuario (igual que Lighthouse)
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(ruta, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => new Promise((ok) => {
    new PerformanceObserver((l) => { const e = l.getEntries(); ok(e[e.length - 1].startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
  }));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return Math.round(lcp);
}

for (const [ruta, rol] of [["/login", null], ["/home", "paciente"], ["/mis-resultados", "paciente"]]) {
  test(`CP-15 · LCP de ${ruta} en celular con 4G lenta es menor a 2 s (NFR-PERF-2) (INC-39)`, async ({ page }) => {
    test.fail(true, "Defecto conocido INC-39: la carga en perfil móvil supera los 2 s");
    if (rol) await iniciarSesionComo(page, rol);
    const lcp = await medirLCP(page, ruta);
    test.info().annotations.push({ type: "LCP (ms)", description: String(lcp) });
    expect(lcp).toBeLessThan(2000);
  });
}

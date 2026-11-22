// Configuración de Playwright para Cuidarte+ (pruebas de sistema, aceptación, seguridad,
// usabilidad, rendimiento del frontend y resiliencia). El reporte HTML queda en reportes/playwright.
const fs = require("fs");
const { defineConfig, devices } = require("@playwright/test");

// Microsoft Edge solo se usa si está instalado (en el pipeline se instala; en un equipo local puede no estar)
const hayEdge =
  process.env.CI === "true" ||
  fs.existsSync("/Applications/Microsoft Edge.app") ||
  fs.existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

const navegadores = [
  { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 800 } } },
  { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } } },
  { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
  ...(hayEdge ? [{ name: "msedge", use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1280, height: 800 } } }] : []),
].map((p) => ({ ...p, testMatch: /cp26-.*\.spec\.js/, dependencies: ["preparacion"] }));

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ["list"],
    ["html", { outputFolder: "../reportes/playwright", open: "never" }],
    ["json", { outputFile: "../reportes/playwright-resultados.json" }],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3334",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "preparacion", testMatch: /preparacion\.setup\.js/ },
    {
      name: "computador",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
      testIgnore: [/cp26-.*\.spec\.js/, /cp28-.*\.spec\.js/],
      dependencies: ["preparacion"],
    },
    ...navegadores,
    // CP-28 reinicia el backend: se ejecuta al final, cuando las demás pruebas terminaron
    {
      name: "resiliencia",
      testMatch: /cp28-.*\.spec\.js/,
      dependencies: ["computador", ...navegadores.map((n) => n.name)],
    },
  ],
});

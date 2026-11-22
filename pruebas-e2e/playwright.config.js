// Configuración de Playwright para Cuidarte+
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3334",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // NFR-COMPAT-1 (navegador moderno de escritorio) y NFR-COMPAT-2 (móvil)
    { name: "computador", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
});

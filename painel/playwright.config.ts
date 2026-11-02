import { defineConfig, devices } from "@playwright/test";

// E2E contra o painel em container (scripts/teste-e2e.sh sobe tudo e passa as variáveis E2E_*).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:18080",
    trace: "retain-on-failure",
    locale: "pt-BR",
    // Em produção o Cloudflare Tunnel manda o IP real neste cabeçalho (usado no limite de tentativas).
    extraHTTPHeaders: { "cf-connecting-ip": "198.51.100.7" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

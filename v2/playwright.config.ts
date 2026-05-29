import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3010",
    url: "http://127.0.0.1:3010/login",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-e2e-anon-key",
      NEXT_PUBLIC_USE_LIVE_DATA: "off",
      TIDYTAILS_E2E_AUTH_BYPASS: "on",
    },
  },
  projects: [
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
});

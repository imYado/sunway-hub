import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://hub:hub@localhost:5432/sunwayhub_e2e";

// End-to-end tests run against a production build (`npm run build` first) with
// local file storage and a file-based email outbox instead of Vercel Blob and Gmail.
export const e2eEnv = {
  DATABASE_URL,
  SESSION_SECRET: "e2e-session-secret-e2e-session-secret-0123456789",
  OTP_PEPPER: "e2e-otp-pepper-e2e-otp-pepper-0123456789",
  ADMIN_EMAIL: "mohammedalqadhi745@gmail.com",
  ALLOWED_EMAIL_DOMAINS: "imail.sunway.edu.my,sunway.edu.my",
  CRON_SECRET: "e2e-cron-secret",
  APP_URL: `http://localhost:${PORT}`,
  STORAGE_CAP_GB: "1",
  STORAGE_DRIVER: "local",
  EMAIL_TRANSPORT: "file",
  ALLOW_LOCAL_STORAGE_IN_PRODUCTION: "1",
  ALLOW_FILE_EMAIL_IN_PRODUCTION: "1",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv,
  },
});

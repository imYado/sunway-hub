import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

const OUTBOX = path.join(process.cwd(), ".data", "outbox");

export async function latestCode(to: string, since: number): Promise<string> {
  for (let i = 0; i < 50; i++) {
    if (existsSync(OUTBOX)) {
      const msgs = readdirSync(OUTBOX)
        .map((f) => JSON.parse(readFileSync(path.join(OUTBOX, f), "utf8")) as { to: string; text: string; at: string })
        .filter((m) => m.to === to && new Date(m.at).getTime() >= since)
        .sort((a, b) => b.at.localeCompare(a.at));
      const m = msgs[0] && /code is (\d{6})/.exec(msgs[0].text);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No code emailed to ${to}`);
}

export async function signInMember(page: Page, email: string, username?: string) {
  await page.goto("/login");
  await ready(page);
  const since = Date.now() - 1000;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const code = await latestCode(email, since);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (username) {
    await expect(page.getByRole("heading", { name: "Welcome to SJ Study" })).toBeVisible();
    await page.getByLabel("Full name").fill(`Test ${username}`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel(/I have read and accept/).check();
    await page.getByRole("button", { name: "Finish setup" }).click();
  }
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
}

export const ADMIN_EMAIL = "mohammedalqadhi745@gmail.com";
export const ADMIN_PASSWORD = "Tropical-Kettle-49-Orbit";

export async function signInAdmin(page: Page) {
  await page.goto("/login");
  await ready(page);
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function pngFile(name = "notes.png", w = 64, h = 48) {
  const buffer = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 64, b: 175 } } })
    .png()
    .toBuffer();
  return { name, mimeType: "image/png", buffer };
}

/** Waits until React has hydrated, so form submissions go through the client. */
export async function ready(page: Page) {
  await page.locator("html[data-hydrated]").waitFor();
}

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN_EMAIL, ADMIN_PASSWORD, latestCode, pngFile, ready, signInAdmin, signInMember } from "./helpers";

test.describe.configure({ mode: "serial" });

const ALICE = "alice@imail.sunway.edu.my";
const BOB = "bob@sunway.edu.my";
let postUrl = "";

test("logged-out visitors only see public pages", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  for (const path of ["/terms", "/privacy", "/guidelines", "/copyright", "/contact"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByText("not affiliated with or endorsed by Sunway University").first()).toBeVisible();
  }
  const api = await page.request.get("/api/subjects");
  expect(api.status()).toBe(401);
});

test("non-Sunway emails are rejected with neutral wording", async ({ page }) => {
  await page.goto("/login");
  await ready(page);
  await page.getByLabel("Email").fill("someone@imail.sunway.edu.my.evil.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Only Sunway email addresses can sign in.");
});

test("admin first-time sign-in: code, create password, then password sign-in", async ({ page }) => {
  await page.goto("/login");
  await ready(page);
  const since = Date.now() - 1000;
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  const code = await latestCode(ADMIN_EMAIL, since);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create your password" })).toBeVisible();
  await page.getByLabel("New password").fill("password123");
  await expect(page.getByRole("button", { name: "Save password" })).toBeDisabled();
  await page.getByLabel("New password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  // Onboarding (admin needs a username too).
  await expect(page.getByRole("heading", { name: "Welcome to Sunway Hub" })).toBeVisible();
  await page.getByLabel("Full name").fill("Site Admin");
  await page.getByLabel("Username").fill("hub_owner");
  await page.getByLabel(/I have read and accept/).check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/admin/clubs");
  await ready(page);
  await page.getByRole("button", { name: "Import Sunway clubs" }).click();
  await expect(page.getByText("Imported 0 new clubs; 45 already existed.")).toBeVisible();

  // Sign out and back in with the password.
  await page.context().clearCookies();
  await signInAdmin(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("member sign-in with onboarding; admin area is hidden (404)", async ({ page }) => {
  await signInMember(page, ALICE, "alice_s");
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  const queue = await page.goto("/admin/queue");
  expect(queue?.status()).toBe(404);
});

test("post upload -> approval -> visible to other members", async ({ browser }) => {
  const alice = await browser.newPage();
  await signInMember(alice, ALICE);
  await alice.goto("/posts/new");
  await ready(alice);
  await alice.getByLabel("Title").fill("Week 3 notes on recursion");
  await alice.getByLabel("Description").fill("My own summary with a diagram.");
  await alice.getByLabel(/Subject tags/).fill("CSC1024 Programming Principles");
  await alice.getByLabel(/Subject tags/).press("Enter");
  await alice.getByLabel("Semester").selectOption("Jan 2026");
  await alice.getByLabel("Attachments (optional)").setInputFiles(await pngFile());
  await alice.getByLabel(/This is my own work/).check();
  await alice.getByRole("button", { name: "Submit for approval" }).click();
  await alice.waitForURL(/\/posts\/[0-9a-f-]{36}$/);
  postUrl = new URL(alice.url()).pathname;
  await expect(alice.getByText("Pending approval")).toBeVisible();
  await expect(alice.getByRole("img", { name: /Image attached/ })).toBeVisible();

  // Bob cannot see the pending post or its file.
  const bob = await browser.newPage();
  await signInMember(bob, BOB, "bob_t");
  const hidden = await bob.goto(postUrl);
  expect(hidden?.status()).toBe(404);
  const fileSrc = await alice.getByRole("img", { name: /Image attached/ }).getAttribute("src");
  const fileRes = await bob.request.get(fileSrc!);
  expect(fileRes.status()).toBe(404);

  // Admin approves from the queue.
  const admin = await browser.newPage();
  await signInAdmin(admin);
  await admin.goto("/admin/queue");
  await ready(admin);
  const item = admin.locator("[data-queue-item]", { hasText: "Week 3 notes on recursion" });
  await item.getByRole("button", { name: "Approve" }).click();
  // Approved items leave the queue.
  await expect(item).toHaveCount(0);

  // Now Bob can see it and download the file (served with nosniff).
  await bob.goto(postUrl);
  await ready(bob);
  await expect(bob.getByRole("heading", { name: "Week 3 notes on recursion" })).toBeVisible();
  const ok = await bob.request.get(fileSrc!);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
  await bob.getByRole("button", { name: /Helpful/ }).click();
  await expect(bob.getByRole("button", { name: /Helpful \(1\)/ })).toBeVisible();
  await bob.goto("/");
  await expect(bob.getByRole("link", { name: "Week 3 notes on recursion" })).toBeVisible();
  await Promise.all([alice.close(), bob.close(), admin.close()]);
});

test("bad words are blocked on the server and in the browser", async ({ page }) => {
  await signInMember(page, ALICE);
  await page.goto("/settings");
  await ready(page);
  await page.getByLabel("Bio").fill("this is sh1t");
  await expect(page.getByText("Please remove inappropriate language and try again.").first()).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(/Please remove inappropriate language/);
});

test("profile picture needs admin approval", async ({ browser }) => {
  const alice = await browser.newPage();
  await signInMember(alice, ALICE);
  await alice.goto("/settings");
  await ready(alice);
  await alice.getByLabel("Upload a new picture").setInputFiles(await pngFile("me.png", 600, 400));
  await alice.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(alice.getByText(/visible to others after the admin approves/)).toBeVisible();

  const bob = await browser.newPage();
  await signInMember(bob, BOB);
  await bob.goto("/u/alice_s");
  await expect(bob.getByRole("img", { name: /Profile picture/ })).toHaveCount(0);

  const admin = await browser.newPage();
  await signInAdmin(admin);
  await admin.goto("/admin/queue");
  await ready(admin);
  const item = admin.locator("[data-queue-item]", { hasText: "Profile picture of" });
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item).toHaveCount(0);

  await bob.goto("/u/alice_s");
  await expect(bob.getByRole("img", { name: /Profile picture of/ })).toBeVisible();
  await Promise.all([alice.close(), bob.close(), admin.close()]);
});

test("delete by admin (with reason) and by poster", async ({ browser }) => {
  const admin = await browser.newPage();
  await signInAdmin(admin);
  await admin.goto(postUrl);
  await ready(admin);
  admin.on("dialog", (d) => d.accept());
  await admin.getByLabel("Reason (sent to the poster)").fill("Duplicate of another post");
  await admin.getByRole("button", { name: "Delete post" }).click();
  await admin.waitForURL(/\/admin\/content/);

  const alice = await browser.newPage();
  await signInMember(alice, ALICE);
  const gone = await alice.goto(postUrl);
  expect(gone?.status()).toBe(404);
  await alice.goto("/notifications");
  await expect(alice.getByText(/was removed/)).toBeVisible();
  await expect(alice.getByText("Reason: Duplicate of another post")).toBeVisible();

  // Poster deletes their own post.
  await alice.goto("/posts/new");
  await ready(alice);
  await alice.getByLabel("Title").fill("A post I will delete");
  await alice.getByLabel(/Subject tags/).fill("MTH1114 Computer Mathematics");
  await alice.getByLabel(/Subject tags/).press("Enter");
  await alice.getByLabel(/This is my own work/).check();
  await alice.getByRole("button", { name: "Submit for approval" }).click();
  await alice.waitForURL(/\/posts\/[0-9a-f-]{36}$/);
  const own = new URL(alice.url()).pathname;
  alice.on("dialog", (d) => d.accept());
  await alice.getByRole("button", { name: "Delete post" }).click();
  await alice.waitForURL((u) => u.pathname === "/");
  expect((await alice.goto(own))?.status()).toBe(404);

  await admin.goto("/admin/audit");
  await expect(admin.getByRole("cell", { name: "post.delete_by_owner" }).first()).toBeVisible();
  await expect(admin.getByRole("cell", { name: "post.delete_by_admin" }).first()).toBeVisible();
  await Promise.all([alice.close(), admin.close()]);
});

test("accessibility: main pages have no serious axe violations", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const check = async (path: string) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${path}: ${serious.map((v) => `${v.id} (${v.nodes.map((n) => n.html.slice(0, 120)).join(" / ")})`).join(", ")}`).toEqual([]);
  };
  for (const p of ["/login", "/terms", "/privacy", "/guidelines", "/copyright", "/contact"]) await check(p);
  await signInMember(page, BOB);
  for (const p of ["/", "/search", "/subjects", "/clubs", "/events", "/events?view=calendar", "/posts/new", "/settings", "/u/bob_t", "/notifications"]) {
    await check(p);
  }
  await context.close();
});

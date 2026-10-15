import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ADMIN_EMAIL, ADMIN_PASSWORD, latestCode, pngFile, ready, signInAdmin, signInMember } from "./helpers";

test.describe.configure({ mode: "serial" });

const ALICE = "alice@imail.sunway.edu.my";
const BOB = "bob@sunway.edu.my";
const ERIN = "erin@imail.sunway.edu.my";
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
  await expect(page.getByRole("heading", { name: "Welcome to SJ Study" })).toBeVisible();
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
  await alice.getByRole("radio", { name: "Notes" }).check();
  await alice.getByLabel("Title").fill("Week 3 notes on recursion");
  await alice.getByLabel("Description").fill("My own summary with a diagram.");
  await alice.getByLabel(/^Tags/).fill("CSC1024 Programming Principles");
  await alice.getByLabel(/^Tags/).press("Enter");
  await alice.getByLabel("Semester").selectOption("Jan 2026");
  await alice.getByLabel("Attachments (optional)").setInputFiles(await pngFile());
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
  await bob.getByRole("button", { name: "Upvote this post" }).click();
  await expect(bob.getByRole("button", { name: "Upvote this post" })).toHaveAttribute("aria-pressed", "true");
  await expect(bob.getByLabel("Score 1").first()).toBeVisible();

  // Bob comments with a PDF; Alice replies and edits her post.
  await bob.getByLabel("Add a comment").fill("Thanks, this helped with the tutorial.");
  await bob.locator("#comments").getByText("Attach").locator("input[type=file]").setInputFiles({
    name: "worked-example.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1"),
  });
  await bob.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(bob.getByText("Thanks, this helped with the tutorial.")).toBeVisible();
  await expect(bob.getByText("worked-example.pdf")).toBeVisible();
  await alice.goto(postUrl);
  await ready(alice);
  await alice.getByRole("button", { name: "Reply" }).click();
  await alice.getByLabel("Your reply").fill("Glad it helped!");
  await alice.getByRole("button", { name: "Reply", exact: true }).last().click();
  await expect(alice.getByText("Glad it helped!")).toBeVisible();
  await alice.getByRole("link", { name: "Edit" }).click();
  await ready(alice);
  await alice.getByLabel("Description").fill("My own summary with a diagram, now with an example.");
  await alice.getByRole("button", { name: "Save changes" }).click();
  await alice.waitForURL((u) => u.pathname === postUrl);
  await expect(alice.getByText("now with an example")).toBeVisible();
  await expect(alice.getByText(/\(edited/)).toBeVisible();
  await bob.goto("/");
  await expect(bob.getByRole("link", { name: "Week 3 notes on recursion" })).toBeVisible();
  await Promise.all([alice.close(), bob.close(), admin.close()]);
});

test("timetable, study group, free time and plans", async ({ browser }) => {
  const erinContext = await browser.newContext();
  const erin = await erinContext.newPage();
  await signInMember(erin, ERIN, "erin_q");
  await erin.goto("/schedule/timetable");
  await ready(erin);
  // Upload a calendar file: a Monday 09:00-11:00 lecture (01:00-03:00 UTC), every week.
  await erin.getByLabel("Calendar file (.ics)").setInputFiles({
    name: "timetable.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:CSC1024 Lecture\r\nDTSTART:20260112T010000Z\r\nDTEND:20260112T030000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    ),
  });
  await erin.getByRole("button", { name: "Upload" }).click();
  await expect(erin.getByText("Added 1 weekly slot.")).toBeVisible();
  // And one by hand.
  await erin.getByLabel("Day").selectOption("2");
  await erin.getByLabel("Starts").fill("13:00");
  await erin.getByLabel("Ends").fill("15:00");
  await erin.getByLabel("Class", { exact: true }).fill("MTH1114 Tutorial");
  await erin.getByRole("button", { name: "Add class" }).click();
  await expect(erin.getByText("MTH1114 Tutorial", { exact: true })).toBeVisible();

  await erin.goto("/study-groups");
  await ready(erin);
  await erin.getByLabel("Group name").fill("Recursion crew");
  await erin.getByRole("button", { name: "Make group" }).click();
  await erin.waitForURL(/\/study-groups\/[0-9a-f-]{36}$/);
  const groupUrl = new URL(erin.url()).pathname;
  await expect(erin.getByRole("heading", { name: "Recursion crew" })).toBeVisible();
  const monday = erin.getByRole("region", { name: /^Monday/ });
  await expect(monday.getByText("08:00–09:00, 11:00–22:00")).toBeVisible();
  const invite = await erin.getByLabel("Invite link").inputValue();

  const bob = await browser.newPage();
  await signInMember(bob, BOB);
  expect((await bob.goto(groupUrl))?.status()).toBe(404);
  await bob.goto(new URL(invite).pathname);
  await ready(bob);
  await expect(bob.getByRole("heading", { name: "Recursion crew" })).toBeVisible();
  await bob.getByRole("button", { name: "Join group" }).click();
  await bob.waitForURL((u) => u.pathname === groupUrl);

  // Bob plans a session on Sunday (never in the past); Erin marks herself as going and sees it on her schedule.
  await bob.getByRole("region", { name: /^Sunday/ }).getByRole("link", { name: /Plan something/ }).click();
  await bob.waitForURL(/plan=\d{4}-\d{2}-\d{2}/);
  await ready(bob);
  await bob.getByLabel("What", { exact: true }).fill("Library session");
  await bob.getByLabel("Starts (optional)").fill("16:00");
  await bob.getByRole("button", { name: "Add plan" }).click();
  await expect(bob.getByText("Plan added.")).toBeVisible();
  await expect(bob.getByText("MTH1114 Tutorial")).toHaveCount(0);

  await erin.goto(groupUrl);
  await ready(erin);
  await erin.getByRole("button", { name: "I'm going to Library session" }).click();
  await expect(erin.getByText("2 going")).toBeVisible();
  const axe = await new AxeBuilder({ page: erin as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await erin.goto("/schedule");
  await ready(erin);
  await expect(erin.getByText("Library session")).toBeVisible();
  await expect(erin.getByText("CSC1024 Lecture")).toBeVisible();
  await Promise.all([erinContext.close(), bob.close()]);
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
  await alice.getByLabel(/^Tags/).fill("MTH1114 Computer Mathematics");
  await alice.getByLabel(/^Tags/).press("Enter");
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

for (const colorScheme of ["light", "dark"] as const) test(`accessibility (${colorScheme} mode): main pages have no serious axe violations`, async ({ browser }) => {
  const context = await browser.newContext({ colorScheme });
  const page = await context.newPage();
  const check = async (path: string) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${path}: ${serious.map((v) => `${v.id} (${v.nodes.map((n) => n.html.slice(0, 120)).join(" / ")})`).join(", ")}`).toEqual([]);
  };
  for (const p of ["/login", "/terms", "/privacy", "/guidelines", "/copyright", "/contact"]) await check(p);
  await signInMember(page, BOB);
  for (const p of [
    "/",
    "/search",
    "/subjects",
    "/schedule",
    "/schedule/timetable",
    "/schedule/events",
    "/study-groups",
    "/leaderboard",
    "/clubs",
    "/events",
    "/events?view=calendar",
    "/posts/new",
    "/settings",
    "/u/bob_t",
    "/notifications",
  ]) {
    await check(p);
  }
  await context.close();
});

test("pop-up menu closes on an outside click and on Escape", async ({ page }) => {
  // A fresh member: Bob has used up his sign-in codes for the hour (5 per email).
  await signInMember(page, "frank@imail.sunway.edu.my", "frank_m");
  const menu = page.locator("details[data-popup]");
  await page.getByLabel("Menu").click();
  await expect(menu).toHaveAttribute("open", "");
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(menu).not.toHaveAttribute("open", "");
  await page.getByLabel("Menu").click();
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
});

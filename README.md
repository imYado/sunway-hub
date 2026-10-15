# SJ Study

An unofficial, student-run, non-commercial study and events site for the Sunway University community. Members sign in with their Sunway email, share study notes, follow clubs and RSVP to events. Every post, profile picture and club logo is approved by the single site admin before anyone else can see it.

SJ Study is not affiliated with or endorsed by Sunway University or Sunway Group. It uses no Sunway logo or brand colours.

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS
- Neon Postgres (Singapore) through Drizzle ORM and `@neondatabase/serverless`
- Vercel Blob in **private** mode for files, Vercel Cron for daily jobs
- `nodemailer` with Gmail SMTP for email

**External services.** Hosting uses only Vercel and Neon. The only other external dependencies are Resend (when `RESEND_API_KEY` is set) and Gmail SMTP through `nodemailer`, used to send sign-in codes and the daily notification digest, plus Microsoft sign-in (when `MICROSOFT_CLIENT_ID` is set) so Sunway accounts can sign in without an emailed code. It sits behind `sendEmail()` in `src/server/email.ts`, so swapping providers means changing that one file. The Privacy Policy says the same thing.

## Project layout

| Path | What it holds |
| --- | --- |
| `src/app` | Pages, server actions (`src/app/actions`) and API routes (`src/app/api`) |
| `src/server/dal` | The data-access layer. Every read and write takes an `Actor` and checks permissions here |
| `src/server/auth` | Email codes, sessions, admin password (Argon2id) and TOTP |
| `src/db` | Drizzle schema; SQL migrations live in `drizzle/` |
| `src/lib` | Pure helpers: email-domain rules, profanity filter, file rules, dates (Asia/Kuala_Lumpur) |
| `src/content` | Legal page drafts, guidelines and the built-in Sunway clubs list |
| `scripts` | `migrate.ts` and `seed.ts` |
| `tests/unit`, `tests/e2e` | Vitest and Playwright (with axe) tests |

## Local development

Requirements: Node 20+ and a Postgres 15+ database (a free Neon branch works, or a local Postgres).

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run db:migrate
npm run db:seed -- --demo       # --demo also adds a few example subjects
npm run dev
```

For local work without Blob or Gmail, add these to `.env.local`:

```
STORAGE_DRIVER=local     # files go to .data/blob
EMAIL_TRANSPORT=file     # emails, including sign-in codes, go to .data/outbox/*.json
```

Production refuses to start with either of these set, unless `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=1` / `ALLOW_FILE_EMAIL_IN_PRODUCTION=1` is also set. The e2e tests set those flags; never set them on Vercel.

### Checks and tests

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/sunwayhub_test npm test   # unit tests (resets that database)
npm run build && npm run test:e2e   # browser tests; uses the database in E2E_DATABASE_URL (default postgres://hub:hub@localhost:5432/sunwayhub_e2e) and wipes it first
```

If Playwright can't find its browser, set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium binary.

## Deploying

### 1. Neon (database)

1. Create a Neon account and a project in **AWS Asia Pacific (Singapore)**, `ap-southeast-1`.
2. Create a database called `sunwayhub`.
3. Copy two connection strings from **Connection details**:
   - the **pooled** one (host contains `-pooler`) for `DATABASE_URL`
   - the **direct** one for `DATABASE_URL_UNPOOLED` (used by migrations)
4. Under **Settings > Storage / Restore**, keep the history retention window at the longest your plan allows. This is what point-in-time restore uses.

### 2. Vercel (hosting)

1. Import this GitHub repository into a new Vercel project (framework: Next.js).
2. `vercel.json` already pins the functions to **Singapore (`sin1`)** so they sit next to the database.
3. Set the environment variables (next section) for **Production**, and for **Preview** if you use preview deploys. Point Preview at a separate Neon branch, not the production database.

### 3. Vercel Blob (private file storage)

1. In the Vercel project go to **Storage > Create > Blob**.
2. Choose **Private** access and the Singapore region, then connect it to the project.
3. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically. Files are only served through `/api/files/...`, which checks the viewer's session and the post's approval state. Raw Blob URLs are never shown to users.

### 4. Gmail app password (email)

1. Create a **dedicated** Gmail account for the site, for example `sjstudy.noreply@gmail.com`. Don't use a personal account.
2. Turn on **2-Step Verification** for it: Google Account > Security.
3. Open **Google Account > Security > App passwords**, create one named "SJ Study", and copy the 16-character password.
4. Set `SMTP_USER` to the Gmail address, `SMTP_APP_PASSWORD` to the app password with spaces removed, and `SMTP_FROM` to `"SJ Study <that address>"`.

Gmail allows roughly 500 messages a day. That is why every non-urgent notification is batched into one daily digest, and the digest job stops at 400 emails per run.

### 5. Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | migrations | Neon direct connection string; `db:migrate` falls back to `DATABASE_URL` |
| `BLOB_READ_WRITE_TOKEN` | yes, on Vercel | Set automatically when the Blob store is connected |
| `SESSION_SECRET` | yes | Random string of 32+ characters. Signs sessions and encrypts the TOTP secret, private messages and message images |
| `OTP_PEPPER` | yes | Random string of 32+ characters. Used to hash sign-in codes and rate-limit keys |
| `ADMIN_EMAIL` | yes | `mohammedalqadhi745@gmail.com`. The only account that can ever be admin |
| `ALLOWED_EMAIL_DOMAINS` | yes | `imail.sunway.edu.my,sunway.edu.my`. Exact domains only, so subdomains and lookalikes are rejected |
| `RESEND_API_KEY`, `EMAIL_FROM` | recommended | Resend API key and sender, for example `"SJ Study <noreply@sjstudy.booktabib.com>"`. Used first when set. University mail servers may block codes sent from Gmail |
| _(no setting)_ | - | When the Sunway code doesn't arrive, the code screen offers: email the admin from the uni address, or continue as a read-only guest. Only Sunway emails can sign in. Accounts made earlier with another email show as not verified until the admin clicks "Mark Sunway email as verified" in Admin > Users |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | recommended | Adds "Sign in with your Sunway Microsoft account", which needs no email. Register an app in Microsoft Entra ID (accounts in any organizational directory) with redirect URI `<APP_URL>/api/auth/microsoft/callback`. Only Sunway's directories are accepted (`src/lib/microsoft.ts`) |
| `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_FROM` | yes, unless Resend is set | Gmail settings from step 4. Used as the fallback when Resend is set |
| `CRON_SECRET` | yes | Random string. Vercel Cron sends it as a Bearer token |
| `APP_URL` | yes | Public URL with no trailing slash, e.g. `https://sjstudy.vercel.app` |
| `STORAGE_CAP_GB` | yes | Blob allowance in GB. Uploads show a warning at 80% and are refused at 90% |

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Changing `SESSION_SECRET` signs everyone out, breaks the stored TOTP secret and makes existing private messages and their images unreadable. Only rotate it if it has leaked. Turn TOTP off first and set it up again afterwards.

### 6. Migrations and seed

This happens automatically. On every Vercel deploy, the `vercel-build` script in `package.json` runs the migrations and then the seed (`tsx scripts/seed.ts --deploy`) before building. Once the database variables are set, redeploy and the tables are created.

The deploy seed is safe to run every time. It adds:
- version 1 of the Terms and Privacy Policy
- the 45 built-in Sunway clubs, only while the clubs table is empty, so clubs the admin deletes don't come back
- default site settings
- four past paper directory posts (links to official Cambridge, AUSMAT, ACCA and Sunway Library pages, in `src/content/past-papers.ts`), posted once as anonymous approved posts from the admin account. They're added on the first deploy after the admin has signed in, and deleted ones don't come back.

If `DATABASE_URL` isn't set, both steps are skipped and the build carries on. Preview deploys migrate whatever database their variables point at, so point Preview at a separate Neon branch.

To run the same steps by hand (for example against a fresh Neon branch), export `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, then run:

```bash
npm run db:migrate
npm run db:seed
```

To change the schema: edit `src/db/schema.ts`, run `npm run db:generate`, review the new SQL in `drizzle/`, then commit it. The next deploy applies it.

### 7. Deploy and cron

Push to the production branch and Vercel builds and deploys it. `vercel.json` registers one cron job:

| Path | Schedule | What it does |
| --- | --- | --- |
| `/api/cron/daily` | `0 18 * * *` (02:00 Malaysia time) | Purges items soft-deleted more than 30 days ago (with their files), cleans abandoned uploads, sends event reminders and the daily email digest, and tidies expired sessions, codes and rate-limit rows |

The route rejects requests without `Authorization: Bearer $CRON_SECRET`. Every step is idempotent, so running it twice is harmless. To test it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-SITE/api/cron/daily
```

### 8. First admin sign-in

1. Open `/login` and enter `ADMIN_EMAIL`.
2. Enter the 6-digit code from the email, then create a password of at least 12 characters.
3. Finish onboarding (name, username, accept the terms).
4. Go to **Admin > Security** and turn on two-factor authentication (TOTP) with an authenticator app.
5. Go to **Admin > Clubs** and click **Import Sunway clubs** if you didn't run the seed.

From then on the admin signs in with password plus TOTP. A forgotten password is reset with an emailed code from the login page.

## Backups and restore

There are two layers.

1. **Neon point-in-time restore** (main safety net). In the Neon console, open the project, go to **Branches**, then **Restore**. Pick a timestamp inside the retention window. Restoring to a new branch first lets you check the data before switching. To switch, either restore the main branch in place, or point `DATABASE_URL` / `DATABASE_URL_UNPOOLED` at the restored branch in Vercel and redeploy.
2. **Admin full export.** **Admin > Data tools > Download full backup** downloads a JSON file of every table. The audit log is included; secrets are not (password hashes, the TOTP secret, sign-in codes, sessions). Keep a copy somewhere private after big changes. It holds personal data, so treat it the way the Privacy Policy says.

Files in Blob are not covered by Neon restore. A restored database can reference files that were purged after that point; those show as missing and the admin can remove the posts. Blob has no built-in versioning, so the Blob store is the one part you can't roll back.

To restore from a full export instead of Neon, for example when moving to a new Neon project: create the project, run `db:migrate`, then load each table from the JSON with a small script. The parent tables come first: users, then clubs, subjects, posts, then everything else. This is a manual, last-resort path.

## Manual steps before launch

- [ ] Create the Neon project (Singapore) and set history retention.
- [ ] Create the Vercel project and the **private** Blob store, and connect them.
- [ ] Create the dedicated Gmail account, turn on 2-step verification and make an app password.
- [ ] Set every environment variable for Production, using fresh random secrets.
- [ ] Redeploy after setting the variables, so the deploy creates the tables and adds the clubs.
- [ ] Deploy, then confirm the cron job appears under **Vercel > Settings > Cron Jobs**.
- [ ] Sign in as admin, set the password, finish onboarding and **turn on TOTP**.
- [ ] Fill in `[OWNER NAME]` and `[EFFECTIVE DATE]` in `src/content/legal/terms.ts` and `privacy.ts`, or edit them in **Admin > Legal**. Have the drafts reviewed; they are not legal advice.
- [ ] Send yourself a sign-in code to confirm Gmail delivery, and check it doesn't land in spam.
- [ ] Upload a test post from a second account, approve it, and delete it again.
- [ ] Review the blocked-words list under **Admin > Blocked words** and add any local terms.
- [ ] Download a first full backup from **Admin > Data tools**.

## Not built yet

Phase 2 from the spec has not been built: Q&A per subject, an opt-in contributor leaderboard and a study group finder. The schema and the data-access layer are set up so these can follow the same approval, filter and report rules. There is deliberately no marketplace or anything involving money.

## Assumptions and open questions

Choices made where the spec left room:

1. **Upload quotas** count each file when its upload is authorised, not when the post is approved. A rejected post still uses that day's quota.
2. **Duplicate files** (same SHA-256 as an existing upload) are flagged to the admin in the queue, not refused.
3. **Club manager proof** is a short text field. The admin checks it by hand.
4. **Email**: sign-in codes are sent straight away. Every other notification goes into one daily digest, to stay under Gmail's daily limit. In-app notifications are immediate.
5. **The audit log** is append-only, enforced by database triggers, and kept indefinitely. A retention period may need to go into the Privacy Policy.
6. **PDF, DOCX and PPTX** files are download-only with no inline preview. This avoids rendering untrusted documents in the browser. Images and MP4 videos preview inline.
7. **Takedown requests** hide the reported post immediately until the admin reviews it. Separately, any post with 3 open reports is hidden automatically.
8. **Image moderation**: there is a pluggable adapter in `src/server/moderation.ts`, switched off. No provider is wired in, because any provider would be a new external service that receives user images.
9. **Bad-word filter**: it covers English plus some common Malay and Cantonese slang. Short words like "bodoh", "diu" and "tiu" may catch innocent text. The admin can allow-list any word under **Admin > Blocked words**.
10. **Admin identity** comes only from `ADMIN_EMAIL`. There is no `is_admin` column, so changing admin means changing that variable (see `HANDOVER.md`).
11. **Loading skeletons** appear on the home feed only. Route-level `loading.tsx` files were left out on purpose:
    - Next.js then sends the page shell before access checks finish, so hidden pages answer `200` instead of `404`.
    - Forms on those pages could stay stuck on "Please wait..." after saving.

Open questions for the owner:

- Which contact email should the legal pages and the takedown page show?
- Is a custom domain planned? If so, update `APP_URL` and the Gmail sender address.
- Should alumni keep access after their Sunway email is deactivated? Right now they can't receive sign-in codes, so in practice they lose access.

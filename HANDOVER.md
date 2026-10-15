# Handing over SJ Study

Read this when the current owner, the admin in `ADMIN_EMAIL`, is about to graduate or step away. Start the handover a few weeks before the owner's Sunway email stops working. Accounts tied to that email can't be recovered afterwards.

## Who the next admin should be

- A current Sunway student with at least two semesters left. A student society committee member is a good fit.
- Someone who has used the site, has read the Terms, Privacy Policy and Community Guidelines, and accepts that they will be the contact for takedown requests and data-access requests.
- Comfortable approving posts most days. The target is to act on takedown reports within 48 hours.
- Ideally someone who can read TypeScript, or who has a friend who can, so dependency updates keep happening.

The site has exactly one admin by design. There is no way to add a second one, so pick one person.

## What has to move

| Thing | Where | How to transfer |
| --- | --- | --- |
| Admin role | `ADMIN_EMAIL` env var in Vercel | Change the variable (steps below) |
| Vercel project | vercel.com | Invite the new owner to the team, or transfer the project to their account under **Settings > Advanced > Transfer project**. The Blob store and cron move with the project. |
| Neon project | console.neon.tech | Use **Project settings > Transfer project** to move it to the new owner's account or organisation. The connection strings stay the same. |
| Gmail sender account | Google account | Change the password, the recovery email and phone, and 2-step verification to the new owner's. Then make a **new app password** and update `SMTP_APP_PASSWORD`. Revoke the old app password. |
| GitHub repository | github.com | Transfer it, or add the new owner as an admin. Then reconnect the Vercel project to the repository if Vercel asks. |
| Domain (if any) | The registrar | Transfer the domain or change its registrant. Check the auto-renew payment method, because it's tied to the old owner. |
| Legal pages | Admin > Legal | Publish a new version with the new owner's name and contact email. Members are asked to accept it on their next visit. |

## Step by step

1. **Agree on a date** and announce the change in **Admin > Site settings > Announcement** a week ahead.
2. **Download a full backup** from **Admin > Data tools** and give it to the new owner through a private channel. Delete your own copy once the handover is done.
3. **Transfer the Neon project, the Vercel project, the GitHub repository and the domain**, in that order. Check the site still loads after each step.
4. **Hand over the Gmail account**: new password, new recovery details, 2-step verification moved to the new owner's phone, a new app password, and `SMTP_APP_PASSWORD` updated in Vercel.
5. **Rotate secrets** in Vercel: `CRON_SECRET`, `OTP_PEPPER` and `SESSION_SECRET`.
   - Before rotating `SESSION_SECRET`, the old admin turns TOTP off in **Admin > Security**, because the new secret can't decrypt the old TOTP key.
   - Rotating `SESSION_SECRET` signs everyone out, which is expected. It also makes existing private messages unreadable, so only rotate it if it may have leaked.
6. **Change `ADMIN_EMAIL`** in Vercel to the new owner's email and redeploy.
   - The old address immediately becomes an ordinary member, or is refused if it isn't a Sunway address.
   - The new admin's previous member account, if any, keeps its posts.
7. **The new admin signs in**:
   - At `/login` with their email, they get a code, create a password and turn on TOTP in **Admin > Security**.
   - The old admin's password record stays in the database but is tied to the old user and is never used again.
8. **Update the legal pages** with the new owner's name and contact email, and publish them as a new version.
9. **Check the cron** under **Vercel > Settings > Cron Jobs** the next morning. Confirm the digest email arrived.

## If the owner has already left

Without Vercel or Neon access, the site can't be handed over. Start a new deployment from a fork of the repository (see `README.md`). Members' data can only be moved if someone has a recent full backup.

## Ongoing upkeep for the new admin

- Work through the approval queue and reports regularly. Reported posts with 3 or more reports are already hidden.
- Watch **Admin > Dashboard** for Blob storage use. Uploads are refused at 90% of `STORAGE_CAP_GB`.
- Update dependencies each semester (`npm outdated`, then `npm test`, `npm run build` and `npm run test:e2e`).
- Download a full backup each month and before any big change.

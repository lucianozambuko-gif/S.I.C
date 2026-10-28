# S.I.C Growth

The S.I.C (Service Investment Connections) website with a working back end: enquiry, Private Desk, referral and mailing-list forms; email alerts and auto-replies; and a password-protected dashboard ("S.I.C Studio") for managing leads, packages, showreel clips and contact details.

**Stack:** Node.js 20 + Express · Turso (libSQL) database · Cloudinary for video/photo uploads · Nodemailer (any SMTP) · plain HTML/CSS/JS front end. Deploys to Render with the included `render.yaml`.

## What works

| Visitor does | What happens |
|---|---|
| **Book a project** / **Choose a package** | The enquiry form opens with that package already selected. It's saved to the database, the team gets an email alert, and the client gets a branded confirmation. |
| **Request a private consultation** | The same form in Private Desk mode, with an extra "best way to reach you" field. It's tagged **PRIVATE** in the dashboard. |
| **Refer someone** | The referral form. It's tracked through New → Contacted → Signed on → Free clip given. |
| **Join the list** | The visitor is added to the mailing list and sent a welcome email with a one-click unsubscribe link. |
| Opens `/#enquire`, `/#private` or `/#refer` | The matching form opens automatically. Useful for Instagram bios and WhatsApp messages. |
| Browses **/projects** | A fighter-select roster of the projects from the dashboard. Each starts locked (a dark silhouette); hovering (or tapping on a phone) unlocks it with an arcade flash. Unlock them all and the roster completes. A scoreboard shows how many projects there are per topic. Opening one shows the clip, write-up and a "Start a project like this" link. A project without a photo or clip shows the S.I.C mark. |
| Uses **/contact** | The full enquiry form on its own page, with a Project / Private Desk switch. It saves to the dashboard like the pop-up form. Links: `/contact?package=Scale`, `/contact?private`, `/contact?project=Name`. |

**Dashboard (`/admin`)**

- **Overview:** new enquiries, last 7 days, open Private Desk requests, subscriber count, a 30-day chart and who is enquiring.
- **Enquiries:** a pipeline board (New, Contacted, Proposal sent, Won, Lost). Drag cards between columns, or open one to see the details, reply by email, WhatsApp or call, add team notes, or delete. You can search, filter and export to CSV.
- **Referrals, Mailing list:** track statuses, remove entries and export subscribers to CSV.
- **Packages:** add, edit, reorder, hide or highlight the "Growth, packaged" tiers. Changes go live on the site immediately.
- **Projects:** add, edit, reorder or hide the work shown on `/projects`: name, client, category, year, write-up, an optional link, and a preview clip or photo (uploaded or linked).
- **Showreel:** upload a video or photo (or paste a link) for the left or right hero phone, or for the "On the reel" strip. The strip stays hidden until it has at least one clip.
- **Settings:** public email, alert email, WhatsApp number (shows a WhatsApp button on the site), Instagram, TikTok and YouTube links, and password change.

Security: bcrypt-hashed passwords; an httpOnly session cookie; rate limits on forms and login; honeypot spam traps; server-side validation; a strict Content-Security-Policy; and CSV exports protected against spreadsheet formula injection.

## Run it locally

```bash
cp .env.example .env      # set ADMIN_EMAIL and ADMIN_PASSWORD; leave TURSO empty
npm install
npm run dev               # http://localhost:3000  and  http://localhost:3000/admin
```

Without Turso, the app uses a local SQLite file at `data/sic.db`. Without SMTP, emails are printed to the console instead of being sent.

Smoke test (with the server running): `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run smoke`

## Deploy to Render

1. **Database:** create one in Turso.
   ```bash
   turso db create sic-growth
   turso db show sic-growth --url          # → TURSO_DATABASE_URL
   turso db tokens create sic-growth       # → TURSO_AUTH_TOKEN
   ```
   The tables are created automatically on first start.
2. **Code:** push this folder to a GitHub repo.
3. **Render:** go to New → **Blueprint** and pick the repo. Render reads `render.yaml` and asks for:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: your first login. Change the password in Settings afterwards.
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   - `PUBLIC_URL`: for example `https://sic-growth.onrender.com`, or the custom domain once it's connected.
   - **Email:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
     - Gmail: `smtp.gmail.com`, port `465`, with an App Password (not your normal password).
     - Brevo: `smtp-relay.brevo.com`, port `587`.
   - `CLOUDINARY_URL`: copy it from the Cloudinary dashboard. This is optional; without it, you can paste links to clips instead of uploading.

   `JWT_SECRET` is generated for you.
4. **Domain:** add the custom domain under Settings → Custom Domains, then set `PUBLIC_URL` to it.

> On Render's free plan, the service sleeps after 15 minutes without traffic, so the first visit after that takes a few seconds. For an A-list launch, use the Starter plan so the site is always awake.

## Client preview (GitHub Pages)

Every push to `main` publishes `public/` to <https://lucianozambuko-gif.github.io/S.I.C/> through `.github/workflows/pages.yml`. This is a front-end preview only. The site shows its built-in content, `/projects` shows labelled sample entries, the contact page hands the message to email (or WhatsApp) instead of saving it, the home-page forms can't submit, and `/admin` isn't published. The full app runs on Render.

## Files

```
server.js            Express app: public API, admin API, static site
db.js                Turso/libSQL connection, schema, seed data
lib/                 auth (JWT cookie), mail (SMTP + email template), media (Cloudinary), validate
public/index.html    The website
public/projects.html Projects page (public/js/projects.js)
public/contact.html  Contact page
public/about.html    About page (S.I.C Growth intro and services)
public/css/site.css  Site styles (luxury layer, modal, showreel)
public/js/site.js    Animations, live content, forms
public/admin/        S.I.C Studio dashboard
render.yaml          Render Blueprint
scripts/smoke.js     End-to-end API check
```

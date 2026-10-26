# Decisions

What was built at each milestone, the key decisions, why we made them, and what we
rejected. Written to be explained out loud in the demo.

## M0: Scaffold and first deploy (23 Oct 2026)

**Built:** Express 5 API with `/api/health`, environment validation, MongoDB
connection, security middleware and a single error format; React shell with routing,
Tailwind and a landing page; a dev runner; tests; a Render Blueprint.

**Decisions**

1. **One origin for the API and the website.** Express serves `/api/*` and the built
   React app from the same Render service. The login cookie stays first-party, so
   `SameSite=Lax` works, there is no CORS setup, and third-party cookie blocking cannot
   break login. *Rejected:* website on Vercel or Netlify plus API on Render, which
   needs CORS and cross-site cookies that browsers increasingly block.

2. **The server refuses to start with bad configuration.** zod checks every
   environment variable at startup and lists the missing or invalid ones, without
   printing their values. Required values in `.env.example` are blank on purpose: a
   sample `ADMIN_EMAILS` value copied to production would make whoever registers with
   that address an admin. *Rejected:* dotenv (Node's built-in `--env-file` does the job).

3. **The health check tells the truth.** `/api/health` returns 503 until MongoDB is
   connected. Render only sends traffic to healthy instances and restarts one that stays
   unhealthy for 60 seconds. This is our "three-state truth" rule applied to ourselves.
   *Trade-off:* during a database outage, visitors see Render's error page instead of ours.

4. **The health check is not rate limited.** Render calls it every few seconds. If those
   calls counted, the limiter would eventually answer 429 and Render would restart a
   perfectly healthy app.

5. **Request bodies are never logged or echoed.** Express's JSON parser attaches the raw
   body to its error object, and Node's JSON error message can quote the input. So client
   errors (4xx) are never logged, and server errors (5xx) log only the stack trace. A test
   sends a malformed body containing a fake key and checks it is not echoed back.

6. **Caching that never serves a stale app.** Files in `/assets` have a content hash in
   their name, so browsers cache them for a year. `index.html` is never cached, so a new
   deploy shows up on the next page load. A missing asset returns 404, not the HTML page.

7. **Client and server install separately.** Two independent apps, each with its own
   `package.json` and lockfile; root scripts tie them together. *Rejected:* npm
   workspaces, which hoist build tools and server packages into one shared folder.

8. **The Render build installs the client's dev tools explicitly.** If
   `NODE_ENV=production` is set during a build, npm skips devDependencies, and Vite is
   one. `npm ci --prefix client --include=dev` avoids that. Verified in a fresh clone
   with `NODE_ENV=production` set.

9. **No extra packages for running two dev servers.** `scripts/dev.js` (about 40 lines)
   starts the API and Vite and stops both on Ctrl+C. *Rejected:* `concurrently`, an extra
   dependency the spec asks us to avoid.

10. **Node 24 LTS, pinned with `"engines": { "node": "24.x" }`.** Render's docs confirm
    it reads version ranges from `engines`; they do not confirm a bare `24` in
    `.node-version`, so we used the documented option. React Router 8 needs Node 22.22+.

11. **Deployment settings live in Git (`render.yaml`).** Render generates `JWT_SECRET`
    (a random 256-bit value). `MONGODB_URI` and `ADMIN_EMAILS` are typed into the dashboard
    when the Blueprint is created and are never committed. Region: Singapore, Render's
    closest region to India.

12. **MongoDB Atlas accepts connections from anywhere (`0.0.0.0/0`).** Render's free
    tier has no fixed outgoing IP address, so we cannot allow-list it. The protection is a
    dedicated database user with a long random password and access to this database only.
    *Rejected:* a paid static IP.

**Versions** (latest stable on 23 Oct 2026): Express 5.3, Mongoose 9.11, Zod 4.6,
React 19.3, React Router 8.5, Vite 8.3, Tailwind CSS 4.3. React Router 8 removed the
`react-router-dom` package; `RouterProvider` now comes from `react-router/dom`.

## M1: Accounts and login (25 Oct 2026)

**Built:** register, login, logout and "who am I" endpoints; a User model; login and
sign-up pages with every state (empty, invalid, sending, server error, success);
pages that require login; toasts; 43 tests, 9 of which run against a real database.

**Decisions**

1. **`cookie-parser` for reading the login cookie** (owner's choice). It is the Express
   team's own package; hand-written cookie parsing in a security product is something
   evaluators would rightly probe. *Rejected:* a 10-line custom parser.

2. **The cookie is the session; JavaScript cannot see it.** The token is a JWT holding
   only the user ID, valid 7 days, in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in
   production). `httpOnly` means even an injected script cannot steal it. `SameSite=Lax`
   means other websites cannot make your browser send it with a POST, which is our
   protection against cross-site request forgery. *Rejected:* storing the token in
   localStorage, where any script on the page can read it.

3. **Every request re-reads the user from the database.** Deleting an account or changing
   a role takes effect on the next request, not when the 7-day token runs out. A test
   checks both.

4. **Login never reveals which emails have accounts.** Wrong password and unknown email
   get the same message, "Invalid email or password." We also run bcrypt for unknown
   emails, so the two cases take the same time. Registration does say "this email
   already has an account" (the spec asks for 409), which is the usual trade-off: a
   clear sign-up experience over hiding that an account exists.

5. **Admins come only from `ADMIN_EMAILS`.** zod drops unknown fields, so sending
   `"role": "admin"` in a sign-up does nothing. A test proves it.

6. **Passwords: 8 to 72 characters, bcrypt cost 12.** bcrypt silently ignores anything
   after 72 bytes, so we reject longer passwords instead of pretending to use them.

7. **The algorithm is pinned (HS256) when checking tokens.** Otherwise a forged token
   could claim `"alg": "none"` and skip the signature. A test tries it.

8. **Rate limits that stop guessing without punishing users.** Sign-up: 10 per 15
   minutes per IP. Login: 10 *failed* attempts per 15 minutes; successful logins do not
   count, so switching between demo accounts never locks anyone out. The limits apply
   only to these two routes. Applying them to "who am I", which every page load calls,
   would lock people out of the app for browsing it.

9. **Logout works without a valid session.** It just clears the cookie, so it can never
   fail. A small deviation from the spec's table, which lists logout as "user only": an
   expired session should still be able to log out cleanly.

10. **"Not logged in" and "could not check" are different states.** If the server is
    unreachable, the app says "We could not check your session" with a retry button,
    instead of showing the login page as if you were logged out. Three-state truth again.

11. **Form errors appear in the form, success appears as a toast.** A problem with what
    you typed is shown next to the field (and the first one gets focus), because a toast
    disappears and is not next to the thing to fix. Actions without a form, such as
    logout, use toasts for both success and failure.

12. **Database tests use their own database.** With `TEST_MONGODB_URI` set, the auth
    tests connect to a database named `firebreak_test`, wipe it before and after, and
    never touch real data. Without it they are skipped, so `npm test` works anywhere.

## M2: Onboarding a project (25 Oct 2026)

**Built:** the Project model; a lockfile parser; secret-name classification with
frontend-exposure detection; the project API (list, create, view, delete, upload
lockfile, replace secret names); a three-step wizard, project cards and the project
overview; two demo projects with real npm lockfiles. 80 tests pass with a database.

**Decisions**

1. **Values never leave the browser, checked three ways.** The browser keeps only the
   text before each `=` and clears the pasted text straight away, then shows the exact
   list before sending. The server accepts only `{ names: [...] }`: an extra field such
   as `values`, or an entry like `KEY=value`, is a 400, and the error never repeats what
   was rejected. In the browser test, the only request body sent was the list of 7
   names; none of the fake values left the page.

2. **The project is created at step 1 of the wizard.** The lockfile and names are
   checked by the server as soon as you add them, so a bad file is reported on the step
   that caused it. *Trade-off:* leaving the wizard halfway leaves a project with
   "Needs info" badges, which you can finish from its overview page.
   *Rejected:* collecting everything and creating at the end, which would report an npm 6
   lockfile only after you had already typed your secret names.

3. **The browser never parses the lockfile.** It only checks the 5 MB size and sends the
   text. All parsing happens on the server, so the browser cannot be tricked into
   trusting a file the server would reject.

4. **"Production" is the default when in doubt.** Packages marked `devOptional` and
   versions installed both as a dev and a normal dependency count as production. Calling
   something "dev-only" when it is not would be false calm.

5. **Exposure is flagged only when a secret is clearly a secret.** A browser-visible
   variable is flagged when its service rule is high or critical, or its name contains
   SECRET, PRIVATE, SERVICE_ROLE or PASSWORD, or ends in _TOKEN. Public-by-design keys
   (Stripe publishable, Supabase anon, Firebase web config) are never flagged; each rule
   says why in a code comment. `VITE_API_BASE_URL` is not flagged: false alarms break
   the promise just as much as missed ones.

6. **A small data-model addition: `secretsUpdatedAt`.** "You have not given us your
   secret names" and "you gave us an empty list" are different answers (unknown versus
   known), and an empty array cannot tell them apart.

7. **Key-rotation links only where we are confident.** The spec says to omit a link
   rather than guess. These pages sit behind logins, and a check showed Stripe redirects
   even a made-up path to its login page, so an HTTP check cannot prove a page exists.
   We kept links only for providers' standard API-key pages (Stripe, Razorpay, OpenAI,
   Anthropic, Google AI Studio, GitHub, Resend, SendGrid). Everything else says "in your
   dashboard".

8. **The lockfile route alone accepts 6 MB.** A 5 MB lockfile grows when wrapped in JSON.
   Express's JSON parser skips a body that has already been read, so we mount a 6 MB parser
   for that one route ahead of the 100 kb parser used everywhere else. A test checks that a
   300 kb lockfile is accepted while a 300 kb project name is rejected with 413.

9. **Inventory badges are neutral, only real exposure is red.** A list of critical secrets
   is not an emergency; a secret that is already public is.

10. **Each test file gets its own test database.** Node runs test files in parallel; two
    files sharing `firebreak_test` wiped each other's data mid-run. They now use
    `firebreak_test_auth` and `firebreak_test_projects`.

11. **Demo lockfiles are real.** `demo/vibe-store` and `demo/calm-notes` were generated by
    npm from pinned versions, and the parser tests run on them.

## M3: Vulnerability scan and triage (26 Oct 2026)

**Built:** an OSV.dev client, a shared 24-hour cache of advisories, the scanner, triage,
a scan endpoint with a 30-second limit, automatic scans after each lockfile upload, a
way to correct a secret's service or impact, and the overview's scan states. 118 tests.

**Decisions**

1. **Checked against the official docs and live calls first.** The batch query returns
   only IDs in the same order as the questions; `next_page_token` appears only for a
   question with more results. The docs give no maximum batch size, so we send 1,000 per
   request. `aliases` and `database_specific.severity` were confirmed on real records,
   which are saved as test fixtures. Tests never touch the network.

2. **A scan is complete or it failed. Nothing in between.** If any OSV call fails or
   takes over 10 seconds, the whole scan is marked failed with a plain message and no
   findings. "No known vulnerabilities" appears only after a scan that succeeded, and says
   how many packages were checked and when.

3. **Scans run in the background.** Uploading a lockfile answers at once with "Checking…",
   and the page checks again every 2 seconds. *Rejected:* scanning inside the upload
   request, which would leave the button spinning with no feedback. Each run has an ID,
   so an older, slower run can never overwrite a newer one. A scan still "running" after
   3 minutes (for example, because Render restarted the server) is reported as
   interrupted, with Retry, instead of spinning forever.

4. **The fixed version is calculated for this exact package.** One advisory often covers
   several packages (lodash and lodash-es have different fixes) and several ranges. We
   take the smallest fix above the installed version, from this package's ranges only.

5. **Triage puts real risk first.** In vibe-store, minimist has a *critical* advisory but
   is a development tool, so it appears under "Low real-world risk" with an explanation,
   below the high-severity lodash issues that run in the live app.

6. **Users can correct our classification.** Our rules cannot know every variable. The
   user can set the service or impact, including "public by design", which clears a
   browser-exposure flag. Corrections are marked "set by you" and survive updating the
   names list.

7. **The 30-second limit is per project and lives in the database.** It survives restarts
   and is shared by every browser tab, unlike an in-memory limiter.

8. **Tests use a fake OSV server.** The test settings point `OSV_BASE_URL` at a small local
   server that serves the saved records or answers 503, so "OSV is down" is tested for real.

## M4: Publishing incidents (26 Oct 2026)

**Built:** the incident matcher; incident, response and notification models; the admin
API and pages (draft, preview, publish, archive); notifications with a bell; matching
for projects that join later. 153 tests.

**Decisions**

1. **The matcher is a pure function.** It takes an incident and a project and returns
   affected, not affected, or unknown, with a sentence explaining why, and the secrets
   at risk. No database, so every rule has a fast unit test, including "calm-notes is
   not affected by any demo incident".

2. **Preview and publish run the same code.** Both use one loop over all projects (read
   through a cursor, so memory stays flat), so the preview count is by construction what
   publishing creates. A test checks the numbers match.

3. **Publishing is safe to repeat.** Responses are upserted against a unique
   `{incident, project}` index; notifications carry a unique `dedupeKey`. Publishing
   twice changes nothing, and if a publish crashed halfway, publishing again finishes
   the job. A test deletes a notification "lost to a crash" and checks the retry restores
   exactly one. *Small model addition:* `dedupeKey` on notifications. The spec's "one
   notification per newly created response" alone could not heal a crash between the
   two writes.

4. **Fan-out runs inside the publish request.** Fine at this scale (a few hundred
   projects take seconds). In production this would move to a job queue so a publish
   never times out and work is retried automatically.

5. **The incident is marked published before the fan-out.** A project created during
   the fan-out is then caught by late-joiner matching. Without this, it would be missed
   by both.

6. **Late joiners.** Creating a project, uploading a lockfile, changing secret names or
   correcting a secret re-checks the project against every published incident. A
   response waiting for information becomes "open" (with a new notification) or
   "not affected: Checked after your upload". Responses already being worked on are left
   to the user.

7. **"Unknown" always says what is missing.** For example: "Upload your package-lock.json
   so we can check", or "Add your environment variable names so we can check whether this
   project uses LiteLLM proxy."

8. **Compromise versus vulnerability.** A vulnerability's fix is an upgrade, so no secrets
   are listed. A compromised package can read `process.env`, so every server-side secret
   is listed; for a dev-only package the reason says your local `.env` is what is exposed.
   A host breach exposes everything in that host's environment settings.

9. **Admins see totals, never inventories.** The admin list counts responses by status
   using a database aggregation; no project names, owners or secret names are sent. Admin
   routes are 403 for everyone else, and an admin opening someone's project gets the same
   404 as anyone. Tests check both.

10. **Version ranges are validated when saved** with `semver.validRange`, so the matcher
    never meets a range it cannot read.

11. **Deleting a project removes its responses and their notifications**, so no
    notification ever links to something that no longer exists.

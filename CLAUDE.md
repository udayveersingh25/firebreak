# Firebreak: Breach Response for Vibe-Coded Apps

Build spec for Claude Code. Read this entire file before writing any code. Work one milestone at a time (Section 14).

---

## 1. Context

- This is an end-term college software project. Hard deadline: **27 October 2026, 11:59 PM IST**. The build should be finished by the evening of 26 October.
- Evaluators grade: working core workflows, depth of application logic, architecture and technical decisions, UX reliability (loading, empty, error states), code quality and structure, deployment, documentation, and a Git history that shows real development.
- The project owner directs the build and must be able to explain every major decision in the demo. Document decisions as you go (Section 13).

---

## 2. Product

**Problem.** People who build apps with AI tools ("vibe-coders") now have real users but little security background. When a wave of security disclosures hits (like "Black October", 19 to 22 October 2026), they cannot tell whether they are affected, what is exposed, or what to do first. The result is panic, or worse, doing nothing.

**Target users.** Solo builders and small teams who ship web apps with AI assistance, deploy on platforms like Vercel, Render, Railway or Netlify, and depend on third-party services such as OpenAI, Stripe, Supabase and MongoDB Atlas.

**Solution.** Firebreak keeps an inventory of each app's dependencies and secrets (names only, never values). When an incident is published or a vulnerability is found, it determines exactly which projects are affected and why, maps the blast radius (which secrets are exposed and what an attacker could do with them), and generates an ordered, trackable response playbook that only closes when the fix is verified.

**Product promise: calm and correct.** Never show false calm (never say "you are safe" when we do not actually know). Never cause false panic (never flag things that are fine).

---

## 3. Non-negotiable principles

1. **Secret values never leave the user's browser.** Users paste their `.env` or `.env.example`; the client extracts only variable NAMES and discards values before any network request. The server independently rejects any payload that looks like it contains a value (defense in depth). No secret value is ever stored, logged, or transmitted.
2. **Three-state truth.** Every check ends in `affected`, `not affected`, or `unknown`. If a scan failed or data is missing, show `unknown` with the reason and the action that resolves it. Never show "no issues" without evidence.
3. **Users only see their own data.** Every project and response route checks ownership. Requesting another user's resource returns 404 (not 403) so its existence is not leaked.
4. **Admins see aggregates, not inventories.** Admins publish incidents and see affected counts, but cannot view other users' projects, dependencies, or secret names.
5. **Depth over breadth.** Four workflows that work reliably beat eight that half-work. Do not add anything outside this spec without asking the owner.

---

## 4. Tech stack (fixed)

- **Client:** React (Vite), React Router, Tailwind CSS
- **Server:** Node.js LTS, Express 5, Mongoose, MongoDB Atlas (M0 free tier)
- **Auth:** bcrypt + JWT in an httpOnly cookie. No auth frameworks or providers.
- **Validation:** zod on every request body, params, and query
- **Security middleware:** helmet, express-rate-limit
- **Version matching:** semver
- **Vulnerability data:** OSV.dev API (free, no key)
- **Tests:** Node's built-in runner (`node --test`) for core logic
- **Module system:** ES modules everywhere (`"type": "module"` in the server's package.json). Never mix `require` and `import`.
- **Env loading:** no dotenv. Local dev uses `node --env-file=.env`. Production uses plain `node` because Render injects env vars (the `--env-file` flag errors if the file is missing). Validate required env vars with zod at startup and exit with a clear message if any are missing.
- **Deployment:** a single Render web service. Express serves both the API (`/api/*`) and the built React app from the same origin.

**Why single origin:** the auth cookie stays first-party, so `SameSite=Lax` works, no CORS is needed, and browsers' third-party cookie blocking cannot break login. Record this in `docs/DECISIONS.md`.

**Express 5 gotchas:** the SPA catch-all must use a named wildcard (`app.get('/{*splat}', ...)`); a bare `'*'` throws. `req.query` is read-only, so store validated query data on a new property (e.g. `req.validated`) instead of reassigning it. Rejected promises in async handlers reach the error middleware automatically.

Ask the owner before adding any dependency not listed here.

---

## 5. Repository structure

```
/
  CLAUDE.md
  README.md
  .gitignore                (node_modules, .env, dist, coverage)
  package.json              (root scripts: dev, build, start, test, seed)
  client/                   (Vite React app)
    src/
      pages/
      components/
      api/                  (fetch wrapper, one module per resource)
      hooks/
      lib/                  (envNameExtractor.js lives here: runs in the browser)
  server/
    package.json
    .env.example
    src/
      index.js              (connect DB, start server)
      app.js                (express app, middleware, routes, static client)
      config/               (env validation, db connection)
      models/
      routes/
      controllers/
      middlewares/          (requireAuth, requireAdmin, loadOwnedProject, validate, errorHandler)
      services/             (lockfileParser, envClassifier, osvClient, scanner, triage, matcher, playbook, responseMachine, notifier)
      rules/                (serviceRules.js, frontendPrefixes.js)
    scripts/
      seed.js
    tests/
  demo/                     (real lockfiles and .env.example files used in the demo)
  docs/
    ARCHITECTURE.md
    DECISIONS.md
    DEMO.md
```

Follow MVC: routes only map paths to controllers, controllers handle HTTP concerns, services hold pure business logic, models hold schemas.

---

## 6. Data model (Mongoose)

**User**
- `name` (string, required), `email` (string, required, unique, lowercase, trimmed)
- `passwordHash` (string, required, `select: false`)
- `role` (`user` | `admin`, default `user`)
- timestamps

**Project**
- `owner` (ObjectId ref User, indexed), `name` (string, 1 to 60 chars)
- `hostingProvider` (`vercel` | `render` | `railway` | `netlify` | `zeabur` | `fly` | `other`)
- `lockfile`: `{ uploadedAt, lockfileVersion, packageCount }` or null
- `dependencies`: array of `{ name, version, isDev, isDirect }` (multikey index on `dependencies.name`)
- `secrets`: array of `{ name, serviceKey, serviceLabel, capability, criticality, publicByDesign, exposedInFrontend, exposureReason, rotateUrl, rotationNotes, userOverride, lastRotatedAt }`
- `scan`: `{ status: never | running | succeeded | failed, lastRunAt, error, packagesScanned }`
- `findings`: array of `{ vulnId, aliases, packageName, installedVersion, severity, summary, fixedVersion, isDev, isDirect, priority, explanation }`
- timestamps

**Incident**
- `title`, `description` (plain language), `kind` (`vulnerability` | `compromise`)
- `target`: `{ type: package | service | hosting, packageName, affectedRange, fixedVersion, serviceKey, hostingProvider }`
- `severity` (`low` | `moderate` | `high` | `critical`), `sourceUrl` (optional)
- `status` (`draft` | `published` | `archived`), `isSimulated` (boolean)
- `publishedAt`, `createdBy` (ref User), `matchedCounts`: `{ affected, unknown }`
- timestamps

**IncidentResponse**
- `incident` (ref), `project` (ref), `owner` (ref User, indexed)
- **Unique compound index on `{ incident, project }`** so fan-out retries can never create duplicates
- `status` (`open` | `in_progress` | `resolved` | `not_affected` | `unknown`)
- `affectedReason` (plain language), `affectedSecrets` (array of names)
- `steps`: array of `{ key, title, detail, type: manual | auto_verify, order, done, doneAt }`
- `notAffectedReason`, `resolvedAt`
- `timeline`: array of `{ at, actor: user | system, action, detail }`
- timestamps

**Notification**
- `user` (ref, indexed), `type`, `title`, `body`, `link`, `readAt`, timestamps

**VulnCache**
- `vulnId` (unique), `data` (OSV record), `fetchedAt` (TTL index: expire after 24 hours)

---

## 7. Core logic (services)

All services in this section must be pure or near-pure functions with unit tests.

### 7.1 Lockfile parser (`lockfileParser.js`)

- Accept `package-lock.json` with `lockfileVersion` 2 or 3 only. For version 1, return: "This lockfile is from npm 6 or older. Run `npm install` with npm 7 or newer and upload the new file."
- Read the `packages` object. Skip the root `""` key, but read its `dependencies`, `devDependencies`, `optionalDependencies` and `peerDependencies` to know which packages are direct.
- Package name = the text after the LAST `node_modules/` in the key. This handles nested paths (`node_modules/a/node_modules/b`) and scoped names (`node_modules/@scope/pkg`).
- `isDev` is true only when the entry has `dev: true`. Treat `devOptional` as production (conservative, per the "no false calm" principle).
- `isDirect` is true when the key is exactly `node_modules/<name>` and the name is listed in the root entry's dependency fields.
- Keep every distinct `(name, version)` pair.
- Reject with specific messages: file over 5 MB, invalid JSON, missing `packages` object.
- Parse on the server. The client sends the raw file text and never pre-parses for trust purposes.

### 7.2 Env name extraction (client) and classification (server)

**Client (`client/src/lib/envNameExtractor.js`):**
- Accept pasted text or a `.env` / `.env.example` file read locally with FileReader.
- Per line: ignore blank lines and lines starting with `#`; strip a leading `export `; take the text before the first `=`; trim; keep it only if it matches `/^[A-Za-z_][A-Za-z0-9_]*$/`.
- Discard everything else immediately. Show a preview: "We found N variable names. Values were discarded in your browser and will never be sent." Send `{ names: [...] }` only after the user confirms.

**Server (`envClassifier.js`):**
- Accept only `{ names: string[] }`: max 200 names, each 1 to 100 chars, each matching the name regex. Anything else is a 400. This also catches accidental `KEY=value` strings.
- For classification, strip any frontend prefix first (`VITE_OPENAI_API_KEY` is classified using the `OPENAI_API_KEY` rule).
- Classify with `rules/serviceRules.js`: an ordered list of `{ pattern, serviceKey, serviceLabel, capability, criticality, publicByDesign, rotateUrl, rotationNotes }`. First match wins, so specific patterns go before generic ones. Unmatched names get `serviceKey: "unknown"`, criticality `medium`, and the user can override service and criticality (`userOverride: true`).
- `capability` is plain language describing what an attacker could do with the secret.

**Starter rules** (verify every `rotateUrl` before using it; omit a URL rather than guess):

| Name pattern | Service | Capability (plain language) | Criticality |
|---|---|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_SK`, `STRIPE_API_KEY` | Stripe | Create charges, issue refunds, read customer and payment data | critical |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Forge payment events your server will trust | high |
| `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PK` | Stripe | Public by design | public |
| `RAZORPAY_KEY_SECRET` | Razorpay | Create and refund payments | critical |
| `RAZORPAY_KEY_ID` | Razorpay | Public by design | public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Full database access that bypasses Row Level Security | critical |
| `SUPABASE_ANON_KEY`, `SUPABASE_URL` | Supabase | Public by design (protected by Row Level Security) | public |
| `MONGO_URI`, `MONGODB_URI`, `DATABASE_URL`, `POSTGRES_URL` | Database | Read, change, or delete all of your app's data | critical |
| `JWT_SECRET`, `SESSION_SECRET`, `AUTH_SECRET`, `NEXTAUTH_SECRET` | Your app's login system | Forge sessions as any user, including admins | critical |
| `AWS_SECRET_ACCESS_KEY`, `AWS_ACCESS_KEY_ID` | AWS | Use your cloud account and run up your bill | critical |
| `GITHUB_TOKEN`, `GH_TOKEN` | GitHub | Read or change your repositories | critical |
| `CLERK_SECRET_KEY` | Clerk | Manage every user account in your app | critical |
| `LITELLM_MASTER_KEY`, `LITELLM_*` | LiteLLM proxy | Use every AI provider key configured in your proxy | critical |
| `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT*` | Firebase Admin | Full admin access to your Firebase project | critical |
| `FIREBASE_*` (web config: API key, auth domain, project ID) | Firebase | Public by design (protected by security rules) | public |
| `OPENAI_API_KEY` | OpenAI | Spend your OpenAI credits | high |
| `ANTHROPIC_API_KEY` | Anthropic | Spend your Anthropic credits | high |
| `GEMINI_API_KEY`, `GOOGLE_API_KEY` | Google AI | Spend your Google AI credits | high |
| `RESEND_API_KEY`, `SENDGRID_API_KEY`, `MAILGUN_API_KEY` | Email provider | Send emails as your domain (phishing your users) | high |
| `TWILIO_AUTH_TOKEN` | Twilio | Send SMS and calls billed to you | high |
| `CLOUDINARY_API_SECRET` | Cloudinary | Upload, change, or delete your media | medium |

Rotation notes example: for `JWT_SECRET` and similar, "Rotating this logs every user out. That is expected and safe."

**Frontend exposure detection** (`rules/frontendPrefixes.js`):
- These prefixes are bundled into the browser: `VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`, `EXPO_PUBLIC_`, `NUXT_PUBLIC_`, `PUBLIC_`, `GATSBY_`.
- Flag `exposedInFrontend` when a name has one of these prefixes AND is not `publicByDesign` AND either matches a rule with criticality `high` or `critical`, or contains `SECRET`, `PRIVATE`, `SERVICE_ROLE`, `PASSWORD`, or ends with `_TOKEN`.
- `exposureReason` example: "Variables starting with VITE_ are bundled into your website's JavaScript. Anyone can open DevTools and copy this key."
- Public-by-design names (`VITE_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_FIREBASE_API_KEY`) must NOT be flagged. False alarms break the product promise. Add code comments explaining why each is safe.

### 7.3 OSV scanner (`osvClient.js`, `scanner.js`)

- Verify all request and response shapes against the official docs at https://google.github.io/osv.dev/api/ before implementing. If anything below differs from the docs, follow the docs and note it in DECISIONS.md.
- Batch query: `POST https://api.osv.dev/v1/querybatch` with one query per unique `(name, version)`, ecosystem `npm`. Chunk to the documented max per request. Handle pagination tokens if present.
- Batch results contain only vulnerability IDs. Fetch details with `GET https://api.osv.dev/v1/vulns/{id}` using a concurrency limit of about 5, and cache them in VulnCache.
- For each finding compute:
  - `severity`: use `database_specific.severity` when present (GitHub advisories use LOW, MODERATE, HIGH, CRITICAL), otherwise `UNKNOWN`.
  - `fixedVersion`: the smallest `fixed` event in the matching SEMVER range that is greater than the installed version, otherwise null (display "No fixed version yet").
- 10 second timeout per request. On any OSV failure: set `scan.status = "failed"` with a plain-language error and offer Retry. **Never display partial or failed results as clean.**
- Rate limit scans: one per project per 30 seconds (429 with a friendly message).
- Mapping from OSV records to findings must be unit tested with saved JSON fixtures (no network in tests).

### 7.4 Triage (`triage.js`)

Assign each finding a priority and a plain-language explanation:
- Production + direct + (critical or high): **Fix now**
- Production + transitive + (critical or high): **Fix soon** (explain: "This comes from a package you installed, not one you installed directly.")
- Production + moderate, low, or unknown: **Plan a fix**
- Dev-only, any severity: **Low real-world risk** ("This package only runs on your computer during development, for example a file watcher. It is not part of what your users interact with.")

Sort by priority, then severity. The overview shows counts per priority.

### 7.5 Incident matcher (`matcher.js`)

Pure function: `(incident, project) -> { status: affected | not_affected | unknown, reason, affectedSecrets }`.

- **Package target:** affected if any dependency has `name === packageName` and `semver.satisfies(version, affectedRange)`. Reason example: "You have lodash 4.17.15 installed. Versions below 4.17.21 are affected." Mention when the match is dev-only. If the project has no lockfile: `unknown`, reason "Upload your package-lock.json so we can check."
- **Service target:** affected if any non-public secret has `serviceKey === target.serviceKey`. Affected secrets are those secrets. If the project has no secrets list: `unknown`.
- **Hosting target:** affected if `hostingProvider === target.hostingProvider`. Affected secrets are ALL non-public secrets, because everything in that host's environment settings is exposed.
- **Blast radius by kind:**
  - `vulnerability`: no secrets are marked exposed; the fix is an upgrade.
  - `compromise` + package target with a production match: assume all server-side (non-public) secrets are exposed, because malicious code can read `process.env`. A dev-only match exposes the developer's local `.env`, so treat it the same and say so in the reason.
- Validate `affectedRange` with `semver.validRange` when the admin saves the incident.

**Fan-out on publish:**
- Iterate projects with a cursor, run the matcher, and upsert an IncidentResponse for every `affected` or `unknown` result. The unique index makes retries safe.
- Create exactly one notification per newly created response (not on upserts that already existed).
- Store `matchedCounts` on the incident.
- Running synchronously inside the publish request is fine at this scale. Note in DECISIONS.md that production would move this to a job queue.
- **Late joiners:** when a project is created, or its lockfile or secrets change, re-run the matcher against every published, non-archived incident.
- **Dry run:** `POST /api/admin/incidents/:id/preview` returns `{ affected, unknown }` counts and writes nothing.

### 7.6 Playbook generator (`playbook.js`)

Pure function: `(incident, project, matchResult) -> ordered steps`.

**Vulnerability (package target):**
1. "Upgrade {pkg} to {fixedVersion} or later." For direct dependencies, show the npm install command. For transitive ones, explain updating the parent package or using npm `overrides`.
2. "Redeploy your app."
3. "Upload your updated package-lock.json." Type `auto_verify`: the system re-parses the new lockfile and completes this step only if no installed version still satisfies `affectedRange`. Users cannot tick it manually.

**Compromise (any target):**
- If package target: first step "Remove {pkg} or pin it to a safe version."
- For each affected secret, ordered by criticality (critical, high, medium) then name:
  - "Create a new {service} key" (link `rotateUrl` when known)
  - "Replace {NAME} in your {hostingProvider} environment settings"
- Then one step: "Redeploy your app."
- Then, per secret: "Revoke the old {NAME} at {service}."
- For critical secrets: "Check {service} logs and billing for activity you do not recognize."
- Include each secret's `rotationNotes` in the step detail.
- Explain in the UI why new keys are created and deployed BEFORE old ones are revoked: so the app never goes down mid-rotation.

### 7.7 Response state machine (`responseMachine.js`)

- `open` -> `in_progress` when the first step is completed.
- `in_progress` -> `resolved` only when every step is done and every `auto_verify` step has passed. The server enforces this and returns 409 otherwise.
- `open`, `in_progress`, or `unknown` -> `not_affected` when the user declares it with a reason of at least 10 characters (e.g. "We removed LiteLLM last week."). The user can reopen it.
- `unknown` is set by the system. When the missing data arrives, re-run the matcher: becomes `open` if affected, or `not_affected` with reason "Checked after your upload: not affected."
- Steps can be unticked only while the response is not resolved. Resolved responses are read-only.
- Every transition and step change appends a timeline entry `{ at, actor, action, detail }`.
- Unit test every allowed and forbidden transition.

---

## 8. API

All routes are under `/api`. Error shape everywhere: `{ "error": { "code": "...", "message": "..." } }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /health | none | Health check for Render |
| POST | /auth/register | none | Create account |
| POST | /auth/login | none | Log in, set cookie |
| POST | /auth/logout | user | Clear cookie |
| GET | /auth/me | user | Current user |
| GET | /projects | user | List my projects with status summaries |
| POST | /projects | user | Create project |
| GET | /projects/:id | owner | Project overview |
| DELETE | /projects/:id | owner | Delete project and its responses |
| PUT | /projects/:id/lockfile | owner | Upload lockfile text, triggers scan and re-matching |
| PUT | /projects/:id/secrets | owner | Replace secret names list, triggers re-matching |
| PATCH | /projects/:id/secrets/:name | owner | Override service or criticality, mark rotated |
| POST | /projects/:id/scan | owner | Re-run OSV scan |
| GET | /responses | user | My incident responses |
| GET | /responses/:id | owner | Response detail |
| PATCH | /responses/:id/steps/:stepKey | owner | Tick or untick a manual step |
| POST | /responses/:id/not-affected | owner | Declare not affected with reason |
| POST | /responses/:id/reopen | owner | Reopen a not-affected response |
| POST | /responses/:id/resolve | owner | Resolve (409 if incomplete) |
| GET | /notifications | user | List, newest first, with unread count |
| PATCH | /notifications/:id/read | user | Mark one read |
| PATCH | /notifications/read-all | user | Mark all read |
| GET | /admin/incidents | admin | List incidents with counts |
| POST | /admin/incidents | admin | Create draft |
| PATCH | /admin/incidents/:id | admin | Edit draft only (409 if published) |
| POST | /admin/incidents/:id/preview | admin | Dry-run match counts |
| POST | /admin/incidents/:id/publish | admin | Publish and fan out |
| POST | /admin/incidents/:id/archive | admin | Archive |

Status codes: 400 validation, 401 not logged in, 403 non-admin on admin routes, 404 not found or not owned, 409 state conflict or duplicate email, 413 file too large, 429 rate limited, 502 OSV unavailable, 500 generic with no internal details.

---

## 9. Workflows and acceptance criteria

### W1: Onboard a project
Three-step wizard: (1) name and hosting provider, (2) lockfile upload (optional, with a note that dependency checks will show "unknown" without it), (3) env names via client-side extraction and preview. Ends on the project overview.
- [ ] Secret values never appear in any network request (verify in DevTools Network tab; this is a demo moment)
- [ ] Lockfile v1, invalid JSON, and oversized files each show a specific, helpful error
- [ ] A project created without a lockfile shows dependency checks as "unknown" with an upload action

### W2: Exposure check and triage
Runs automatically after onboarding. The overview shows, in this order: frontend-exposed secrets (most prominent), vulnerability findings grouped by triage priority, and the secret inventory with blast radius ("If STRIPE_SECRET_KEY leaks, someone could create charges and read payment data").
- [ ] `demo/vibe-store` flags `VITE_OPENAI_API_KEY` and does not flag `VITE_STRIPE_PUBLISHABLE_KEY`
- [ ] Dev-only findings appear as "Low real-world risk" with the explanation
- [ ] An OSV failure shows "Scan failed" with Retry, never "No vulnerabilities"
- [ ] Zero findings shows a truthful empty state: "Scanned 312 packages on {date}. No known vulnerabilities."

### W3: Publish an incident (admin)
Admin creates a draft (title, plain-language description, kind, target, severity, source URL, simulated flag), previews counts, publishes, and can archive.
- [ ] Preview counts equal the responses actually created on publish
- [ ] Retrying a publish never duplicates responses or notifications
- [ ] A project created after publishing is matched immediately
- [ ] Non-admins get 403 on every admin route; admins cannot open users' projects

### W4: Guided response (user)
Notification bell leads to the response page: why you are affected (plain language), affected secrets with their capabilities, the ordered checklist, the timeline, and a "Not affected" option with a reason.
- [ ] Resolve is impossible until all steps are done (server-enforced)
- [ ] The auto-verify step completes only after a new lockfile that no longer matches
- [ ] The timeline records every action with timestamp and actor
- [ ] Another user's response ID returns 404

### Stretch (only after W1 to W4 are complete, tested, and deployed)
- S1: Readiness view: last rotated dates, "never rotated" warnings, a "Mark as rotated" action
- S2: Email notifications via Resend (ask the owner first)
- S3: Export a resolved incident's timeline as a Markdown report

---

## 10. UI and UX requirements

- Plain language everywhere. CVE and GHSA IDs may appear but only as secondary detail.
- Status badges: Affected (red), In progress (amber), Resolved (green), Not affected (gray), Needs info / unknown (blue).
- Every data view has a loading state, an empty state with a next action, and an error state with retry.
- Toasts for the success or failure of every mutation. Disable buttons while a request is in flight (prevents double submits).
- Calm tone. Never "You've been hacked!" Always: what is known, what it means, what to do next.
- Responsive down to 375px wide.
- Simulated incidents display a visible "Simulated, inspired by real events" label.
- Pages: Landing (explains the product), Register, Login, Dashboard (projects with status), New Project wizard, Project overview, Response detail, Notifications, Admin incidents list, Admin incident editor (with preview and publish).

---

## 11. Security requirements

This is a security product. Evaluators will probe it. Treat every item as mandatory.

- bcrypt with cost 12. Passwords at least 8 characters. Login failures always return "Invalid email or password."
- JWT payload contains only the user ID; expiry 7 days. Cookie: `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`.
- `requireAuth` loads the user from the database on every request and uses the database role, so role changes apply immediately.
- Admin role is granted only through the `ADMIN_EMAILS` env var at registration or by the seed script. Never from a request body (zod strips unknown keys).
- `loadOwnedProject` queries `{ _id, owner: req.user._id }`. Invalid ObjectIds return 404.
- Strict zod schemas with typed strings, which blocks NoSQL operator injection such as `{ "$gt": "" }`.
- helmet enabled. Rate limits: auth routes 10 per 15 minutes per IP; global 300 per 15 minutes; scans as in 7.3. Set `app.set("trust proxy", 1)` so limits see real client IPs on Render.
- JSON body limit 100kb globally, 6mb only on the lockfile route.
- Never log request bodies. Never return stack traces or internal error messages in production.
- `.env` is gitignored; `server/.env.example` contains placeholders only. Before submission, confirm no secret ever entered Git history.
- MongoDB Atlas network access must allow Render (free tier has no static IP, so `0.0.0.0/0` with a strong password). Record this trade-off in DECISIONS.md.
- **Final milestone includes a security review pass:** check every route for auth and ownership, test cross-user access with two accounts, check validation on every input, and document findings and fixes in DECISIONS.md.

---

## 12. Seed data and demo

**Seed script** (`npm run seed`, idempotent): one admin (email from `ADMIN_EMAILS`), two demo users, their projects, and the incidents below.

**Demo projects** (generate REAL lockfiles by running `npm install` with pinned versions inside the demo folders; never hand-write lockfiles):
- `demo/vibe-store`: includes known-vulnerable older versions of real packages (for example `lodash@4.17.15` as a production dependency and `minimist@1.2.5` as a dev dependency; confirm these appear in OSV before relying on them). Env names: `VITE_OPENAI_API_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `MONGODB_URI`, `JWT_SECRET`, `LITELLM_MASTER_KEY`, `RESEND_API_KEY`. Hosting: Zeabur.
- `demo/calm-notes`: current, patched dependencies. Env names: `MONGODB_URI`, `JWT_SECRET`, `ANTHROPIC_API_KEY`. Hosting: Vercel. This project should come out "not affected" by the simulated incidents.

**Incidents** (all `isSimulated: true` unless every detail is verified against a real advisory):
1. "LiteLLM proxy compromise": kind `compromise`, service target `litellm`
2. "Hosting provider breach": kind `compromise`, hosting target `zeabur`
3. "lodash prototype pollution": kind `vulnerability`, package target `lodash`; take the affected range and fixed version from the real OSV record

Never invent CVE numbers, version ranges, or real-world claims. Descriptions of simulated incidents stay general.

**Demo outline** (write the full version in `docs/DEMO.md`, 3 to 5 minutes):
1. Problem: a real `npm audit` output full of alarming but irrelevant findings, plus the Black October panic
2. Onboard vibe-store, with DevTools open proving only names are sent
3. Exposure check catches `VITE_OPENAI_API_KEY` and ranks real risks above dev-only noise
4. Admin publishes the LiteLLM incident after previewing counts
5. User gets the notification, follows the playbook, and cannot resolve early
6. calm-notes correctly shows "not affected": the calm half of the promise
7. Close on architecture: names-only design, three-state truth, idempotent fan-out

---

## 13. How to work (instructions for Claude Code)

- Complete milestones in order. Do not start the next until the current one's acceptance criteria pass.
- Commit after each working feature with a clear message (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Many small commits, never one large one. Never commit `.env`.
- Write `node --test` unit tests for: lockfile parser, env extraction, env classifier, frontend exposure detection, OSV record mapping (fixtures only), triage, matcher, playbook generator, and the response state machine. Run them before every commit that touches these services.
- After each milestone, append a short entry to `docs/DECISIONS.md`: what was built, the key decisions, why, and alternatives rejected. The owner uses this file to explain the project, so keep it clear and jargon-light.
- Keep `docs/ARCHITECTURE.md` current, including a Mermaid diagram of the request flow and the publish fan-out.
- Ask the owner before: adding dependencies beyond Section 4, changing the data model significantly, or adding scope.
- When you cannot verify something (an external API shape, a provider URL), say so explicitly instead of guessing.
- When you report a milestone as done, list exactly what the owner should click to verify it in the browser, including at least one failure case.

---

## 14. Milestones and schedule

| Milestone | Target | Scope |
|---|---|---|
| M0 | 23 Oct | Repo scaffold, root scripts, Express app with `/api/health`, env validation, Mongo connection, client shell with routing and Tailwind. Deploy a hello-world to Render now to de-risk deployment. |
| M1 | 23 to 24 Oct | Auth end to end (register, login, logout, me), protected client routes, auth pages with all states |
| M2 | 24 Oct | W1: models, lockfile parser, env extraction and classifier, exposure detection, wizard UI, tests. Deploy. |
| M3 | 24 to 25 Oct | W2: OSV client, cache, scanner, triage, overview UI with loading, empty, failed, and success states |
| M4 | 25 Oct | W3: incident admin, matcher, preview, idempotent fan-out, notifications, late-joiner matching |
| M5 | 25 to 26 Oct | W4: playbook generator, response pages, state machine, auto-verify, timeline |
| M6 | 26 Oct | Polish all states, responsive pass, seed and demo data, security review pass, final production deploy with seed loaded |
| M7 | 27 Oct | Owner-led: README review, demo video, incognito checks of every link, submission form before 11:59 PM IST |

Root scripts: `dev` (server with `node --watch --env-file=.env` plus Vite dev server with `/api` proxied to the server), `build` (build the client into `client/dist`), `start` (production: `node server/src/index.js`, serving `client/dist`), `test`, `seed`.

Render: build command installs dependencies for client and server and builds the client; start command runs `npm start`. The free tier sleeps when idle, so the first request after a pause can take up to about a minute. Note this in the README.

---

## 15. README requirements

Required by the course: **Project Name, Problem Statement, Target Users, Solution, Key Features, Tech Stack, Architecture** (with a Mermaid diagram), **Local Setup, Environment Variables** (table with placeholders, no real values), **Deployment** (live URL and cold-start note).

Also include: Security Design (names-only principle, three-state truth, ownership checks), Data Sources (credit OSV.dev), Limitations and Future Work (npm only, curated incident feed, job queue for fan-out, more ecosystems, email alerts), Demo Accounts (seeded credentials for evaluators), and an AI Usage note stating that Claude Code was used as a development tool under the owner's direction.

Server environment variables: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAILS`, `NODE_ENV`, `PORT` (Render sets it), `OSV_BASE_URL` (optional, defaults to `https://api.osv.dev`).

---

## 16. Out of scope

Do not build: storage or validation of real secret values, connections to hosting or provider APIs, GitHub integration, ecosystems other than npm, real-time websockets, payments, or automatic incident ingestion from news. Mention relevant ones under Future Work in the README.

---

## 17. Definition of done

- [ ] All W1 to W4 acceptance criteria pass on the deployed site
- [ ] Deployed URL works in an incognito window, with seed data loaded
- [ ] All unit tests pass
- [ ] Cross-user access tested with two accounts and blocked everywhere
- [ ] No secrets anywhere in the repository or its Git history
- [ ] README, ARCHITECTURE.md, DECISIONS.md, and DEMO.md complete
- [ ] Git history shows steady, incremental commits

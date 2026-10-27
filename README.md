# Firebreak

**Breach response for vibe-coded apps.** Firebreak tells you whether a security
incident affects your app, what is exposed, and what to do first.

- **Live URL:** https://firebreak-0y7c.onrender.com (free tier: the first visit after 15 idle minutes takes about a minute)
- **Status:** all four core workflows work.

## Problem Statement

People who build apps with AI tools ("vibe-coders") now have real users but little
security background. When a wave of security disclosures hits, they cannot tell whether
they are affected, what is exposed, or what to do first. The result is panic, or worse,
doing nothing.

## Target Users

Solo builders and small teams who ship web apps with AI assistance, deploy on platforms
like Vercel, Render, Railway or Netlify, and depend on third-party services such as
OpenAI, Stripe, Supabase and MongoDB Atlas.

## Solution

Firebreak keeps an inventory of each app's dependencies and secrets (names only, never
values). When an incident is published or a vulnerability is found, it works out exactly
which projects are affected and why, shows the blast radius (which secrets are exposed
and what an attacker could do with them), and generates an ordered response checklist
that only closes when the fix is verified.

**Product promise: calm and correct.** Never say "you are safe" without evidence. Never
flag things that are fine.

## Key Features

- [x] **Onboard a project:** upload `package-lock.json`; paste `.env` and only the
      variable names leave your browser
- [x] **Exposure check:** secrets bundled into your website, known vulnerabilities from
      OSV.dev, ranked by real-world risk
- [x] **Incident publishing (admin):** preview how many projects are affected, publish,
      notify, with no duplicates on retry
- [x] **Guided response:** ordered checklist, an upgrade step that verifies itself, a
      timeline, and "not affected" with a reason

## Tech Stack

| Layer | Choice |
|---|---|
| Client | React 19, Vite 8, React Router 8, Tailwind CSS 4 |
| Server | Node.js 24 LTS, Express 5, Mongoose 9 |
| Database | MongoDB Atlas (free M0 cluster) |
| Auth | bcrypt and JWT in an httpOnly cookie |
| Validation | zod on every request |
| Security middleware | helmet, express-rate-limit |
| Vulnerability data | OSV.dev API |
| Tests | Node's built-in test runner (`node --test`) |
| Hosting | One Render web service serving the API and the website |

## Architecture

```mermaid
flowchart LR
  browser(["Browser: React app"])
  subgraph render["Render web service"]
    express["Express 5"]
    api["API: routes, controllers, services, models"]
    site["Built React app (client/dist)"]
  end
  db[("MongoDB Atlas")]
  osv[("OSV.dev API")]

  browser -->|"HTTPS, one origin"| express
  express -->|"/api/*"| api
  express -->|"every other path"| site
  api --> db
  api --> osv
```

One Node.js process serves both the JSON API and the website, so the login cookie is
first-party and no CORS setup is needed. Details, including the request flow, are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Every major decision and its alternatives
are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Local Setup

You need Node.js 24 and a MongoDB Atlas cluster (the free M0 tier is enough).

```bash
git clone <this repository> firebreak
cd firebreak
npm run setup                          # installs server and client dependencies
cp server/.env.example server/.env     # then fill in the values (see below)
npm run dev                            # API on :4000, website on http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Runs all unit and HTTP tests (database tests are skipped) |
| `TEST_MONGODB_URI=<uri> npm test` | Also runs the database tests, in separate `firebreak_test_*` databases that are wiped before and after |
| `npm run build` | Builds the website into `client/dist` |
| `npm start` | Production mode: one server on `PORT` serving the API and `client/dist` |
| `npm run seed` | Loads the demo data (see Demo Accounts). Safe to run again: it never duplicates anything or resets an existing password |

## Environment Variables

Set in `server/.env` locally and in the Render dashboard in production. Never commit real
values.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/firebreak?retryWrites=true&w=majority` | Atlas connection string with a database name. Use a different one locally (e.g. `firebreak_dev`) so testing never touches live data |
| `JWT_SECRET` | yes | `<at least 32 random characters>` | Generate: `node -p "crypto.randomBytes(48).toString('base64url')"` |
| `ADMIN_EMAILS` | yes | `admin@example.com` | Comma-separated; these accounts become admins |
| `NODE_ENV` | no | `development` | `production` on Render |
| `PORT` | no | `4000` | Render sets this itself |
| `OSV_BASE_URL` | no | `https://api.osv.dev` | Defaults to the public OSV API |

If anything required is missing, the server stops at startup and lists what to fix.

## Deployment

Firebreak runs as one free Render web service, defined in [render.yaml](render.yaml).

1. In MongoDB Atlas, create a free cluster, a database user with a long random password,
   and allow network access from `0.0.0.0/0` (Render's free tier has no fixed IP address).
2. Push this repository to GitHub.
3. In Render, choose **New > Blueprint**, select the repository, and enter `MONGODB_URI`
   and `ADMIN_EMAILS` when asked. Render generates `JWT_SECRET` itself.
4. Render runs `npm run build:render`, then `npm start`, and waits for `/api/health` to
   report the database as connected before sending traffic.

5. Load the demo data once: in the Render service's **Shell** tab, run
   `node server/scripts/seed.js` (Render already provides the environment variables).

**Cold starts:** free Render services go to sleep after 15 minutes without traffic. The
first request after that can take about a minute while the service wakes up.

## Security Design

- **Secret values never leave the browser.** Only `.env` variable names are sent; the
  server also rejects anything that looks like a value.
- **Three-state truth.** Every check ends in affected, not affected, or unknown, with the
  reason and the action that resolves it.
- **Users only see their own data.** Another user's project returns 404, so its existence
  is not revealed. Admins see aggregate counts, never inventories.
- **Sessions:** a JWT holding only the user ID, in an `httpOnly`, `SameSite=Lax` cookie
  (`Secure` in production). Passwords are hashed with bcrypt (cost 12). Login failures
  never reveal whether an email has an account.
- **Hardening:** helmet security headers, rate limits (10 sign-ups and 10 failed logins per
  15 minutes per IP), strict zod validation that blocks NoSQL operator injection, request
  bodies never logged, generic error messages for unexpected failures.
- **Reviewed and tested:** every route was checked for login, ownership and validation, and
  attacked with real requests (forged tokens, cross-user access, injection payloads,
  oversized bodies). Those attacks run as tests in
  [server/tests/security.test.js](server/tests/security.test.js); findings and accepted
  trade-offs are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Data Sources

Vulnerability data comes from [OSV.dev](https://osv.dev), an open, distributed
vulnerability database run by Google's open source security team.

## Limitations and Future Work

- npm projects only; other ecosystems (PyPI, Go, Cargo) are future work.
- Incidents are curated by an admin; there is no automatic ingestion from news feeds.
- Publishing fans out inside the request; at larger scale this moves to a job queue.
- Notifications are in-app only; email alerts are future work.
- Logging out deletes the session cookie but does not revoke the token on the server; a
  per-user token version would close that gap.
- There is no cap on projects per account, beyond the request rate limits.

## Demo Accounts

`npm run seed` creates these. Every seeded account uses the password `firebreak-demo`
(set `SEED_PASSWORD` before seeding to change it).

| Account | Email | What you will see |
|---|---|---|
| Admin | the first address in `ADMIN_EMAILS` | The incidents list with the three simulated incidents, their affected counts, and the editor with preview and publish. If that account already existed, the seed keeps its password |
| Maya | `maya@example.com` | **vibe-store** on Zeabur: `VITE_OPENAI_API_KEY` flagged as exposed in the frontend, vulnerability findings ranked by priority, and three open incidents with their checklists |
| Ravi | `ravi@example.com` | **calm-notes** on Vercel: up-to-date packages, no exposed keys, and none of the incidents apply. This is the "calm" half of the promise |

The demo projects come from real lockfiles in [demo/](demo/). Their `.env.example` files hold
placeholder values only, and the seed reads just the variable names from them.

## AI Usage

Claude Code was used as a development tool under the project owner's direction. The owner
set the requirements, reviewed the work, and made the product and architecture decisions
recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

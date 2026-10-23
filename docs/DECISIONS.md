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

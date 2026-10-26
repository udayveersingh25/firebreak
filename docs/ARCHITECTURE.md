# Architecture

Firebreak is one Node.js process on Render. Express serves the JSON API under
`/api/*` and the built React app for every other path, so the browser only ever
talks to one origin.

## Request flow

```mermaid
flowchart TB
  browser(["Browser: React app"])

  subgraph render["Render web service (one Node.js process)"]
    helmet["helmet: security headers"]
    health["GET /api/health: reports database state"]
    limiter["Rate limit: 300 requests per 15 min per IP"]
    json["JSON body parser: 100kb limit"]
    routes["Routes: map URLs to controllers"]
    controllers["Controllers: HTTP in and out"]
    services["Services: business logic, pure functions"]
    models["Mongoose models"]
    errors["Error handler: one error shape"]
    assets["Static files: client/dist"]
    spa["Any other page: index.html, React Router takes over"]
  end

  db[("MongoDB Atlas")]
  osv[("OSV.dev API")]

  browser -->|"same origin, httpOnly cookie"| helmet
  helmet -->|"/api/health"| health
  helmet -->|"/api/*"| limiter --> json --> routes --> controllers --> services --> models --> db
  services -.->|"vulnerability lookups"| osv
  controllers -.->|"thrown errors"| errors
  helmet -->|"/assets/*, /favicon.svg"| assets
  helmet -->|"/projects/123 and other pages"| spa
  health --> db
```

- **Why one origin:** the login cookie is first-party, so `SameSite=Lax` works, no
  CORS setup is needed, and browsers that block third-party cookies cannot break login.
- **Development:** Vite serves the React app on port 5173 and forwards `/api` to the
  API on port 4000, so the browser still sees a single origin.
- **Errors:** every API error has the shape `{ "error": { "code": "...", "message": "..." } }`.
  Unexpected errors become a generic 500; their stack trace goes to the server log only.

## Folder structure

Some folders appear as the milestones that need them land.

```
client/                 React app (Vite)
  src/pages/            one component per page
  src/components/       shared UI (layout, buttons, status badges)
  src/hooks/            reusable React hooks
  src/api/              fetch wrapper, one module per resource
  src/lib/              browser-only logic (the .env name extractor)
server/
  src/index.js          validate env, connect to MongoDB, start listening
  src/app.js            Express app: middleware order, API, static client
  src/config/           env validation (zod), database connection
  src/routes/           URL -> controller mapping only
  src/controllers/      HTTP concerns: read the request, call services, send the response
  src/services/         business logic as pure functions, unit tested
  src/models/           Mongoose schemas
  src/middlewares/      auth, ownership checks, validation, rate limits, errors
  src/validators/       zod schemas for each request
  src/rules/            data tables: secret classification rules, frontend prefixes
  tests/                node --test unit and HTTP tests
demo/                   two demo apps with real npm lockfiles and .env.example files
scripts/dev.js          runs API and client together in development
render.yaml             Render deployment settings
```

## Startup

1. `server/src/config/env.js` validates environment variables with zod. If any are
   missing or invalid, the process prints which ones (never their values) and exits.
2. `server/src/index.js` connects to MongoDB, giving up after 10 seconds with a
   readable error instead of hanging.
3. The app starts listening. On `SIGTERM` (sent by Render before replacing an
   instance) it finishes in-flight requests, closes the database connection and exits.

## Vulnerability scan

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant D as MongoDB
  participant O as OSV.dev
  B->>A: PUT /projects/:id/lockfile (raw text)
  A->>A: parse lockfile into (name, version) pairs
  A->>D: save dependencies, scan = running (new run ID)
  A-->>B: 200, scan running
  par in the background
    A->>O: POST /v1/querybatch (1,000 per request, follow next_page_token)
    O-->>A: vulnerability IDs per package
    A->>D: read cached advisories (24 h)
    A->>O: GET /v1/vulns/{id} for the rest, 5 at a time
    A->>A: map, then triage (Fix now / Fix soon / Plan a fix / Low real-world risk)
    A->>D: save findings, only if the run ID is still current
  and every 2 seconds
    B->>A: GET /projects/:id
    A-->>B: running, then succeeded or failed
  end
```

Any OSV error or 10-second timeout fails the whole scan, so results are never partial.

## Publishing an incident (fan-out)

```mermaid
flowchart TB
  admin(["Admin: Publish"]) --> publish["Mark incident published"]
  publish --> cursor["Read projects one at a time (cursor)"]
  cursor --> match{"matchIncident(incident, project)"}
  match -->|"not affected"| next["Next project"]
  match -->|"affected or unknown"| upsert["Upsert response on unique {incident, project}"]
  upsert --> notify["Upsert notification on unique dedupeKey"]
  notify --> next
  next --> cursor
  cursor -->|"done"| counts["Save matchedCounts { affected, unknown }"]

  preview(["Admin: Preview"]) --> cursor2["Same loop, nothing written"] --> counts2["Return { affected, unknown }"]

  late(["Project created, lockfile or secrets changed"]) --> rematch["Match against every published incident"]
  rematch -->|"no response yet"| upsert
  rematch -->|"response was unknown"| update["Becomes open (notify) or not affected"]
```

- **Idempotent:** the unique indexes mean publishing twice, or after a crash, never
  creates a duplicate response or notification. It only fills gaps.
- **Preview equals publish:** both use the same matching loop.
- **At larger scale** the fan-out would run in a job queue instead of the publish request.

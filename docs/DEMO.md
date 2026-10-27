# Demo script (3 to 5 minutes)

Live site: https://firebreak-0y7c.onrender.com. Open it a minute before recording: the free
Render service sleeps when idle and takes up to a minute to wake.

**Before recording**

- The seed has been run (see README, Demo Accounts). All passwords are `firebreak-demo`.
- Have two browser windows ready: a normal one and an incognito one, so you can be signed
  in as two people at once.
- Have `demo/vibe-store/package-lock.json` and `demo/vibe-store/.env.example` ready to
  upload. For step 5, also have a copy of the lockfile with lodash changed to 4.17.21:

  ```bash
  node -e "const f=require('fs');const l=JSON.parse(f.readFileSync('demo/vibe-store/package-lock.json'));l.packages['node_modules/lodash'].version='4.17.21';f.writeFileSync(process.env.HOME+'/Desktop/patched-package-lock.json',JSON.stringify(l,null,2))"
  ```
- The seed publishes all three incidents. To publish one live in step 4, create a fresh
  draft there (for example a second "LiteLLM proxy compromise" with severity High).

---

## 1. The problem (30 s)

- Show a terminal with `npm audit` run inside `demo/vibe-store`: a long list of alarming
  findings, many of them in dev-only tools that never reach users.
- Say: in October 2026 a wave of security disclosures hit at once. People who built their
  apps with AI tools could not tell whether they were affected, what was exposed, or what
  to do first. Firebreak answers those three questions, calmly and correctly.

## 2. Onboard a project, with proof that no secret leaves the browser (60 s)

1. Register a new account (or sign in as Maya and click **New project**).
2. Step 1: name `my-store`, hosting **Zeabur**.
3. Step 2: upload `demo/vibe-store/package-lock.json`.
4. Open DevTools > **Network** before step 3.
5. Step 3: paste the contents of `demo/vibe-store/.env.example`. Point at the preview:
   "We found 7 variable names. Values were discarded in your browser."
6. Confirm, then click the `secrets` request in the Network tab and show the payload:
   `{ "names": [...] }`, with no values anywhere.

## 3. Exposure check and triage (45 s)

On the project overview:

- **Exposed in your website:** `VITE_OPENAI_API_KEY` is flagged, because anything starting
  with `VITE_` is bundled into the site's JavaScript. `VITE_STRIPE_PUBLISHABLE_KEY` is
  *not* flagged, because publishable keys are public by design. No false alarms.
- **Vulnerabilities:** grouped by priority. lodash (a direct production dependency) is
  "Fix now"; minimist (dev-only) is "Low real-world risk", with the explanation.
  Compare with the `npm audit` wall from step 1.
- **Secret inventory:** each key with its blast radius, for example "If STRIPE_SECRET_KEY
  leaks, someone could create charges…".

## 4. Admin publishes an incident (45 s)

1. In the incognito window, sign in as the admin and open **Incidents**.
2. Show the three simulated incidents, each labelled "Simulated, inspired by real events",
   with their affected counts. Point out that the admin sees counts only, never anyone's
   projects or secret names.
3. Click **New incident** and fill in the draft. Click **Preview** to show
   how many projects would be affected, then **Publish**. The counts match what preview
   said, and publishing again creates nothing new.

## 5. Guided response (60 s)

Back in the first window, as the project owner:

1. Click the **notification bell**, then the LiteLLM notification.
2. Show "Why this project is affected", the exposed secret and what it unlocks, and the
   checklist: create the new key, put it in Zeabur, redeploy, *then* revoke the old one,
   so the app never goes down mid-rotation.
3. Click **Resolve incident** straight away. The server refuses: "Finish every step first."
4. Tick a step: the status becomes **In progress** and the timeline records it.
5. Open the **lodash** response. Its last step, "Upload your updated package-lock.json",
   cannot be ticked by hand. Upload `~/Desktop/patched-package-lock.json` on the project
   page, come back, and show that Firebreak ticked it ("Verified from your lockfile").
   Tick the other two steps and resolve.

## 6. The calm half (20 s)

Sign in as Ravi (`ravi@example.com`). calm-notes is on Vercel, has no LiteLLM key, and runs
a patched lodash, so no incident applies and nothing is flagged. The dashboard says so
plainly. Firebreak does not cry wolf.

## 7. How it works (30 s)

Show the diagram in `docs/ARCHITECTURE.md` and name three decisions:

- **Names only:** secret values are dropped in the browser, and the server rejects anything
  that looks like a value.
- **Three-state truth:** every check is affected, not affected, or unknown, with a reason.
  A failed scan says "Scan failed", never "no issues".
- **Idempotent fan-out:** a unique index on (incident, project) means retrying a publish
  can never duplicate responses or notifications.

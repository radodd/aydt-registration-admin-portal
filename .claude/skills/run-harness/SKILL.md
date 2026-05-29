---
name: run-harness
description: >-
  Run a detailed browser harness against ANY flow in this project — launch the
  app, log in as a role, walk a flow, and screenshot each step. Use to visually
  QA or capture any page/route (admin, instructor, public), not just one flow.
  Triggers: "run a harness on <flow>", "screenshot the <X> flow", "drive
  <route> and capture each step", "visually verify <page>".
---

# Generic UI harness

Drives any flow in the app with Playwright and writes a numbered screenshot per
step. The runner (`harness.cjs`) handles all the boilerplate; you describe the
flow in a small **scenario file**.

## How it works

- **`harness.cjs`** — the runner. Detects the dev-server port, logs in as a
  role, builds a `ctx` (helpers + raw Playwright `page`), runs your scenario,
  and writes screenshots + `notes.txt`.
- **`scenarios/<name>.cjs`** — one file per flow. Exports `{ name, role, run(ctx) }`.
  `run(ctx)` is plain async JS, so it handles dynamic flows (read a value, branch,
  loop) — not just a fixed step list.

## Run an existing scenario

From the repo root:

```bash
node .claude/skills/run-harness/harness.cjs admin-register
```

Options (or env): `--role admin|instructor|parent|none` (`ROLE`),
`--headed` (`HEADED=1`), `--base http://localhost:3004` (`BASE_URL`),
`--out <dir>` (`OUT`).

```bash
node .claude/skills/run-harness/harness.cjs admin-register --role admin --headed
```

The scenario arg resolves as a path, repo-relative path, or a bare name in
`scenarios/` (with or without `.cjs`).

## Write a new scenario (for any flow)

1. Copy `scenarios/_template.cjs` → `scenarios/<your-flow>.cjs`.
2. Set `role` and write `run(ctx)` — drive the flow, calling `ctx.shot("label")`
   at each state worth reviewing. The full `ctx` API is documented at the top of
   `_template.cjs`. Use `ctx.page` directly for anything the helpers don't cover.
3. Run: `node .claude/skills/run-harness/harness.cjs <your-flow>`.

Tip: when asked to QA a flow, look at the relevant components first to find the
real button/label/placeholder strings, then drive by those (the UI has few test
ids). Run once `--headed` if a selector is uncertain.

## Prerequisites

- **Dev server running** (`npm run dev`, any port 3000–3010; auto-detected).
- **Role creds in `.env.local`**: admin → `NEXT_PUBLIC_DEV_ADMIN_*`,
  instructor → `NEXT_PUBLIC_DEV_INSTRUCTOR_*`, parent → `CERT_USER_*`
  (add more roles in the `ROLE_CREDS` map in `harness.cjs`). Use `--role none`
  to skip login for public pages.

## Where output goes

`tests/reports/harness-shots/<scenario-name>/` (gitignored) — `NN-label.png`
plus `notes.txt`. **Open the PNGs and read `notes.txt`** — a blank/`error.png`
frame or an `ERROR:`/`Did not reach…` note means a step failed.

## Gotchas

- **`Cannot find module '@playwright/test'`** — run from inside the repo so Node
  resolves the repo's `node_modules`.
- **Login stuck on `/auth`** — bad/missing role creds, or Supabase dev project
  unreachable.
- **Scenario stalls on a selector** — the live markup differs from what the
  scenario assumes; re-run `--headed` and tighten the selector.

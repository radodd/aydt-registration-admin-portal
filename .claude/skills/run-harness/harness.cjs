/*
 * Generic UI harness runner for this project.
 *
 *   node .claude/skills/run-harness/harness.cjs <scenario.cjs> [options]
 *
 * Handles all the boilerplate — dev-server port detection, role-based login,
 * numbered screenshots, output dir, headed mode — and hands your scenario a
 * `ctx` with helpers + the raw Playwright `page`. See SKILL.md.
 *
 * Options (also settable via env):
 *   --role <admin|instructor|parent|none>   who to log in as     (env ROLE)
 *   --base <url>                            skip port detection  (env BASE_URL)
 *   --out  <dir>                            screenshot dir       (env OUT)
 *   --headed                                visible browser      (env HEADED=1)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ENV_FILE = path.join(REPO_ROOT, ".env.local");

// role -> [emailVar, passwordVar] in .env.local
const ROLE_CREDS = {
  admin: ["NEXT_PUBLIC_DEV_ADMIN_EMAIL", "NEXT_PUBLIC_DEV_ADMIN_PASSWORD"],
  instructor: ["NEXT_PUBLIC_DEV_INSTRUCTOR_EMAIL", "NEXT_PUBLIC_DEV_INSTRUCTOR_PASSWORD"],
  parent: ["CERT_USER_EMAIL", "CERT_USER_PASSWORD"],
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--headed") out.headed = true;
    else if (a === "--role") out.role = argv[++i];
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else out._.push(a);
  }
  return out;
}

function readEnv(name) {
  if (!fs.existsSync(ENV_FILE)) return null;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(new RegExp("^\\s*" + name + "\\s*=\\s*(.*)$"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

async function reachable(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(url + "/auth", { signal: ctrl.signal, redirect: "manual" });
    clearTimeout(t);
    return res.status > 0;
  } catch {
    return false;
  }
}

async function detectBase(explicit) {
  const fromEnv = explicit || process.env.BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  for (let p = 3000; p <= 3010; p++) {
    const url = `http://localhost:${p}`;
    if (await reachable(url)) return url;
  }
  throw new Error("No dev server on ports 3000–3010. Run `npm run dev` or pass --base.");
}

async function login(page, BASE, role) {
  if (role === "none") return null;
  const creds = ROLE_CREDS[role];
  if (!creds) throw new Error(`Unknown role "${role}". Known: ${Object.keys(ROLE_CREDS).join(", ")}, none`);
  const email = readEnv(creds[0]);
  const password = readEnv(creds[1]);
  if (!email || !password) throw new Error(`Missing ${creds[0]} / ${creds[1]} in .env.local for role "${role}"`);
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/auth") && !u.pathname.startsWith("/auth/login"), { timeout: 20000 }),
    page.locator("#login-password").press("Enter"),
  ]);
  return email;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const scenarioArg = args._[0];
  if (!scenarioArg) {
    console.error("Usage: node .claude/skills/run-harness/harness.cjs <scenario.cjs> [--role admin] [--headed] [--base url] [--out dir]");
    console.error("Example: node .claude/skills/run-harness/harness.cjs .claude/skills/run-harness/scenarios/admin-register.cjs");
    process.exit(2);
  }
  // Resolve scenario path: as given, or relative to repo root, or the scenarios dir.
  const tryPaths = [
    path.resolve(scenarioArg),
    path.resolve(REPO_ROOT, scenarioArg),
    path.resolve(__dirname, "scenarios", scenarioArg),
    path.resolve(__dirname, "scenarios", scenarioArg + ".cjs"),
  ];
  const scenarioPath = tryPaths.find((p) => fs.existsSync(p));
  if (!scenarioPath) throw new Error(`Scenario not found. Tried:\n  ${tryPaths.join("\n  ")}`);
  const scenario = require(scenarioPath);
  const name = scenario.name || path.basename(scenarioPath).replace(/\.cjs$/, "");

  const role = args.role || process.env.ROLE || scenario.role || "admin";
  const headed = args.headed || process.env.HEADED === "1" || process.env.HEADED === "true";
  const OUT = path.resolve(args.out || process.env.OUT || path.join(REPO_ROOT, "tests", "reports", "harness-shots", name));
  fs.mkdirSync(OUT, { recursive: true });

  const BASE = await detectBase(args.base);
  console.log(`Scenario: ${name} | base: ${BASE} | role: ${role} | out: ${path.relative(REPO_ROOT, OUT)}`);

  const browser = await chromium.launch({ headless: !headed });
  const browserCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await browserCtx.newPage();
  page.setDefaultTimeout(15000);

  const notes = [];
  let shotN = 0;
  const sleep = (ms) => page.waitForTimeout(ms);
  const ctx = {
    page,
    BASE,
    role,
    sleep,
    note(msg) { notes.push(msg); console.log("NOTE", msg); },
    async shot(label) {
      shotN += 1;
      const file = path.join(OUT, `${String(shotN).padStart(2, "0")}-${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log("SHOT", path.relative(REPO_ROOT, file));
      return file;
    },
    async goto(p) { await page.goto(p.startsWith("http") ? p : BASE + p, { waitUntil: "networkidle" }); },
    async clickRole(roleName, name) { await page.getByRole(roleName, { name }).click(); },
    async clickText(text) { await page.getByText(text, { exact: false }).first().click(); },
    async fillPlaceholder(ph, val) { await page.getByPlaceholder(ph).fill(val); },
    async fillNth(selector, n, val) { await page.locator(selector + ":visible").nth(n).fill(val); },
    async waitText(text) { await page.getByText(text, { exact: false }).first().waitFor(); },
    async exists(text) { return (await page.getByText(text, { exact: false }).count()) > 0; },
  };

  try {
    const email = await login(page, BASE, role);
    if (email) ctx.note(`Logged in as ${role} (${email}); landed on ${new URL(page.url()).pathname}`);
    if (typeof scenario.run !== "function") throw new Error("Scenario must export `run(ctx)`.");
    await scenario.run(ctx);
    ctx.note("Scenario completed.");
  } catch (e) {
    ctx.note("ERROR: " + e.message);
    try { await ctx.shot("error"); } catch {}
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(OUT, "notes.txt"), notes.join("\n") + "\n");
    console.log("\nDone →", path.relative(REPO_ROOT, OUT), "(see notes.txt)");
    await browser.close();
  }
})();

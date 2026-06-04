/*
 * Option B sync verification — semester_payment_plans.installment_count and
 * semester_fee_config.auto_pay_installment_count must agree post-save.
 *   node .claude/skills/run-harness/harness.cjs installment-count-sync --role admin
 *
 * Drives the admin Payment step on an unpublished semester:
 *   1. Sets payment plan type = installments, "Number of installments" = 4.
 *   2. Sets fee config "Auto-pay installment count" to a DIFFERENT value (7),
 *      so the test proves the PLAN value wins (not coincidence).
 *   3. Saves and re-reads BOTH columns via service-role.
 *   4. Asserts both == 4 (the plan value wins), writes pass/fail to notes.
 *
 * Requires: dev server running, NEXT_PUBLIC_DEV_ADMIN_* creds (the dev admin
 * must have super_admin role — semester_payment_plans RLS gates writes to it).
 *
 * Restores both columns to their pre-test values after the assertion.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function makeServiceClient() {
  const env = loadEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function findEditableSemester(supabase) {
  // Prefer draft/scheduled (unambiguously editable) with a semester_payment_plans
  // row of type "installments" — that's the case the sync rule actually targets.
  // The fee_config row may or may not exist; the save path creates it if missing.
  // Falls back to any populated draft/scheduled, or any draft/scheduled at all.
  const { data: rows, error } = await supabase
    .from("semesters")
    .select(
      "id, name, status, location, semester_payment_plans(type, installment_count), semester_fee_config(auto_pay_installment_count)",
    )
    .in("status", ["draft", "scheduled"])
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  if (!rows || rows.length === 0) return { semester: null };

  const getPlan = (r) =>
    Array.isArray(r.semester_payment_plans)
      ? r.semester_payment_plans[0]
      : r.semester_payment_plans;
  const hasPlan = (r) => !!getPlan(r);
  const isInstallments = (r) => getPlan(r)?.type === "installments";
  // Must have Location set so step 1 (Details) "Continue" is enabled — the
  // wizard validates required fields before forward-navigation.
  const hasLocation = (r) => !!r.location && String(r.location).trim() !== "";

  // Priority: has-location AND installments → has-location with any plan →
  // has-location at all → has-plan-but-no-location (logged as a caveat) →
  // anything.
  const tiered = [
    rows.find((r) => hasLocation(r) && isInstallments(r)),
    rows.find((r) => hasLocation(r) && hasPlan(r)),
    rows.find(hasLocation),
    rows.find(hasPlan),
    rows[0],
  ].filter(Boolean);
  return { semester: tiered[0] };
}

async function readCounts(supabase, semesterId) {
  // Resilient reads — supabase fetch can occasionally throw on dev networks;
  // retry each independently up to 3 times before giving up.
  async function tryRead(fn) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fn();
        return res;
      } catch (e) {
        if (i === 2) return { data: null, error: { message: String(e) } };
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return { data: null, error: { message: "unreachable" } };
  }
  const planRes = await tryRead(() =>
    supabase
      .from("semester_payment_plans")
      .select("type, installment_count")
      .eq("semester_id", semesterId)
      .maybeSingle(),
  );
  const feeRes = await tryRead(() =>
    supabase
      .from("semester_fee_config")
      .select("auto_pay_installment_count")
      .eq("semester_id", semesterId)
      .maybeSingle(),
  );
  return {
    plan: planRes.data,
    fee: feeRes.data,
    planErr: planRes.error?.message ?? null,
    feeErr: feeRes.error?.message ?? null,
  };
}

module.exports = {
  name: "installment-count-sync",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;
    const supabase = makeServiceClient();

    // 1. Find an editable semester.
    ctx.note("Discovering an editable semester via service-role…");
    const { semester, error } = await findEditableSemester(supabase);
    if (error) {
      ctx.note(`ERROR: semester discovery failed: ${error}`);
      return;
    }
    if (!semester) {
      ctx.note(
        "No draft/scheduled semester found — cannot run without one (lock trigger blocks edits on published semesters with registrations). Create one and retry.",
      );
      return;
    }
    ctx.note(`Using semester: ${semester.name} (${semester.id}, status=${semester.status})`);

    // 2. Snapshot pre-test values for restoration.
    const before = await readCounts(supabase, semester.id);
    if (before.planErr || before.feeErr) {
      ctx.note(`WARNING reading initial state: plan=${before.planErr} fee=${before.feeErr}`);
    }
    ctx.note(
      `PRE-TEST → plan.type=${before.plan?.type ?? "(no row)"} plan.installment_count=${before.plan?.installment_count ?? "(null)"} fee.auto_pay_installment_count=${before.fee?.auto_pay_installment_count ?? "(no row)"}`,
    );

    try {
      // 3. Navigate DIRECTLY to the Payment step via URL query param.
      // EditSemesterClient reads ?step=<name> on mount to set the step.
      // Use page.goto directly with a lenient wait — dev-server compilation
      // can cause networkidle to never fire on a cold load.
      await page
        .goto(
          `${ctx.BASE}/admin/semesters/${semester.id}/edit?step=payment`,
          { waitUntil: "domcontentloaded", timeout: 30000 },
        )
        .catch((e) => ctx.note(`goto err (non-fatal): ${e.message}`));
      await ctx.sleep(3000);
      await ctx.shot("01-edit-landing");

      const landedOnPayment =
        page.url().includes("step=payment") &&
        (await page.getByText(/Payment Plan|Number of installments|Auto-pay installment count/i).first().count()) > 0;
      ctx.note(
        landedOnPayment
          ? `Reached Payment step. URL: ${page.url()}`
          : `Did NOT reach Payment step. URL: ${page.url()}`,
      );
      await ctx.shot("02-payment-step-initial");
      if (!landedOnPayment) {
        ctx.note("Aborting form interaction — not on Payment step.");
        return;
      }

      // 4. Set plan type → Installments. The four payment-type options are
      // cards (not labeled radios). Click the "Installments" card by its
      // visible title text — Playwright will resolve the clickable parent.
      const installmentsCard = page
        .getByText(/^Installments$/)
        .first();
      if (await installmentsCard.count()) {
        await installmentsCard.click({ force: true }).catch(() => {});
        ctx.note("Clicked Installments card.");
      } else {
        ctx.note("Could NOT find 'Installments' option card.");
      }
      await ctx.sleep(1000);
      await ctx.shot("03-after-set-type-installments");

      // 5. Set "Number of installments" → 4 (input appears after type is set).
      const numInstallments = page.getByLabel(/Number of installments/i).first();
      if (await numInstallments.count()) {
        await numInstallments.fill("4");
        ctx.note("Filled 'Number of installments' = 4.");
      } else {
        ctx.note("Could NOT find 'Number of installments' input — type may not have switched.");
      }
      await ctx.sleep(500);
      await ctx.shot("04-form-installments-count-4");

      // 6. Switch to the "4. Fee Config" sub-tab (Payment step has 4 sub-tabs)
      // and set "Auto-pay installment count" → 7 (a DIFFERENT value than the
      // plan count). The sync rule should still make both = 4 after save.
      const feeConfigTab = page
        .getByRole("button", { name: /Fee Config/i })
        .first()
        .or(page.getByText(/4\. Fee Config|Fee Config/i).first());
      const feeConfigClick = page
        .getByText(/4\. Fee Config/i)
        .first();
      if (await feeConfigClick.count()) {
        await feeConfigClick.click({ force: true }).catch(() => {});
        ctx.note("Clicked Fee Config sub-tab.");
      } else if (await feeConfigTab.count()) {
        await feeConfigTab.click({ force: true }).catch(() => {});
      } else {
        ctx.note("Could NOT find 'Fee Config' sub-tab.");
      }
      await ctx.sleep(1000);

      // Label has no htmlFor → getByLabel won't bind. Use a layout-based
      // locator: find the heading text, scope to the surrounding card, take
      // the number input. Fall back to a positional pick.
      const autoPayByText = page
        .locator("div")
        .filter({ hasText: /^Auto-pay installment count/ })
        .locator("input[type='number']")
        .first();
      const autoPayByPosition = page.locator("input[type='number']:visible").nth(3);
      let autoPayFilled = false;
      for (const cand of [autoPayByText, autoPayByPosition]) {
        if (await cand.count()) {
          await cand.scrollIntoViewIfNeeded().catch(() => {});
          await cand.fill("7").catch(() => {});
          const val = await cand.inputValue().catch(() => "");
          if (val === "7") {
            autoPayFilled = true;
            ctx.note(
              "Filled 'Auto-pay installment count' = 7 (sync should override to 4 on save).",
            );
            break;
          }
        }
      }
      if (!autoPayFilled) {
        ctx.note("Could NOT fill 'Auto-pay installment count' — sync test less conclusive.");
      }
      await ctx.sleep(500);
      await ctx.shot("05-form-fee-config-count-7");

      // 7. Commit form state. The PaymentStep dispatches SET_PAYMENT +
      // SET_FEE_CONFIG (and tuition + special-program slices) inside its
      // bottom Next handler — NOT on input change and NOT on top-right Save.
      // So we MUST click bottom-right "Next →" to flush local form state
      // into the wizard reducer. Then click top Save to persist.
      // Pre-accept any window.confirm (tuition >10% diff guard).
      page.on("dialog", (d) => d.accept().catch(() => {}));

      // Specifically target the bottom "Next →" button (the only one whose
      // visible text contains both "Next" and the "→" arrow). Scroll into
      // view before clicking — Fee Config content is long.
      const bottomNext = page
        .locator("button")
        .filter({ hasText: /Next/ })
        .filter({ hasText: /→/ })
        .last();
      const nextCount = await bottomNext.count();
      ctx.note(`Bottom 'Next →' matches: ${nextCount}`);
      if (nextCount) {
        await bottomNext.scrollIntoViewIfNeeded().catch(() => {});
        await ctx.sleep(400);
        await bottomNext.click({ force: true }).catch((e) => ctx.note(`Next click err: ${e.message}`));
        ctx.note(`Clicked bottom Next. URL after: ${page.url()}`);
      } else {
        ctx.note("Bottom Next NOT found — dispatches will not fire.");
      }
      // Allow time for the dispatch + step transition to settle.
      await ctx.sleep(2500);

      // Now click the top-right Save to persist the (now-dispatched) state.
      const saveLabels = [/^Save$/i, /Save changes/i, /Save semester/i];
      let saved = false;
      for (const re of saveLabels) {
        const btn = page.getByRole("button", { name: re }).first();
        if (
          (await btn.count()) &&
          !(await btn.isDisabled().catch(() => true))
        ) {
          await btn.click().catch(() => {});
          saved = true;
          ctx.note(`Clicked save (matched ${re}).`);
          break;
        }
      }
      if (!saved) ctx.note("Did NOT find an enabled Save button — see screenshot.");

      // Wait for "Saving..." indicator to clear before reading DB.
      const savingIndicator = page.getByText(/^Saving/i).first();
      await savingIndicator
        .waitFor({ state: "detached", timeout: 15000 })
        .catch(() => {});
      await ctx.sleep(2500);
      await ctx.shot("06-after-save");

      // 8. Re-read both columns via service-role and assert.
      const after = await readCounts(supabase, semester.id);
      ctx.note(
        `POST-SAVE → plan.type=${after.plan?.type ?? "(no row)"} plan.installment_count=${after.plan?.installment_count ?? "(null)"} fee.auto_pay_installment_count=${after.fee?.auto_pay_installment_count ?? "(no row)"}`,
      );

      const planCount = after.plan?.installment_count;
      const feeCount = after.fee?.auto_pay_installment_count;
      const bothEqual4 = planCount === 4 && feeCount === 4;
      ctx.note(
        bothEqual4
          ? `✅ SYNC PASS — both columns = 4 (Plan value won over the Fee Config 7).`
          : `❌ SYNC FAIL — plan.installment_count=${planCount}, fee.auto_pay_installment_count=${feeCount}. Expected both = 4.`,
      );

      // 9. Final state shot.
      await ctx.sleep(500);
      await ctx.shot("07-final-state");
    } finally {
      // 10. Restore pre-test values via service-role so the harness is
      //     reversible. If the test crashed mid-flow this still runs.
      ctx.note("Restoring pre-test values via service-role…");
      if (before.plan) {
        await supabase
          .from("semester_payment_plans")
          .update({
            type: before.plan.type,
            installment_count: before.plan.installment_count,
          })
          .eq("semester_id", semester.id);
      }
      if (before.fee) {
        await supabase
          .from("semester_fee_config")
          .update({
            auto_pay_installment_count: before.fee.auto_pay_installment_count,
          })
          .eq("semester_id", semester.id);
      }
      const restored = await readCounts(supabase, semester.id);
      ctx.note(
        `RESTORED → plan.installment_count=${restored.plan?.installment_count ?? "(null)"} fee.auto_pay_installment_count=${restored.fee?.auto_pay_installment_count ?? "(no row)"}`,
      );
    }
  },
};

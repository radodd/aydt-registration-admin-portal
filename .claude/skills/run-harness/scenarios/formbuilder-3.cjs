/*
 * Scenario: meeting-plan item #3 — registration form builder additions
 *   (3a address block + 3b waivers).
 *   node .claude/skills/run-harness/harness.cjs formbuilder-3
 *
 * Creates a fresh blank draft semester (which auto-seeds the new default form
 * containing an address block + a waiver), screenshots the builder, opens the
 * Custom Question modal to show the "Address block" live preview, opens the
 * Waiver modal, then renders the same form family-facing via the preview route.
 * Finally attempts the admin-register QuestionsStep (best-effort).
 */
module.exports = {
  name: "formbuilder-3",
  role: "admin",
  async run(ctx) {
    const { page } = ctx;

    /* ---------------------------------------------------------------- */
    /* 1. Create a fresh blank draft semester                            */
    /* ---------------------------------------------------------------- */
    await ctx.goto("/admin/semesters/new");
    await ctx.sleep(800);
    await ctx.shot("01-semesters-new-landing");

    await ctx.clickText("Start Blank");
    // Redirects to /admin/semesters/<id>/edit?step=details
    await page.waitForURL(/\/admin\/semesters\/[0-9a-f-]+\/edit/, { timeout: 20000 }).catch(() => {});
    await ctx.sleep(2000);

    const url = page.url();
    const m = url.match(/semesters\/([0-9a-f-]+)\/edit/);
    const semId = m ? m[1] : null;
    ctx.note(`Draft semester id: ${semId ?? "UNKNOWN"} (url=${url})`);
    await ctx.shot("02-draft-created-details-step");

    if (!semId) {
      ctx.note("ERROR: could not determine draft semester id; aborting.");
      return;
    }

    /* ---------------------------------------------------------------- */
    /* 2. Jump to the Registration Form builder step                     */
    /* ---------------------------------------------------------------- */
    await ctx.goto(`/admin/semesters/${semId}/edit?step=registrationForm`);
    await ctx.waitText("Registration Form").catch(() => {});
    await ctx.sleep(2500); // allow default-seed + autosave to persist
    await ctx.shot("03-regform-builder-seeded");
    ctx.note(
      `Address-block field shows as "address block"; waiver shows as "waiver + acknowledgment": ` +
        `${(await ctx.exists("waiver + acknowledgment"))} / ${(await ctx.exists("address block"))}`,
    );

    /* ---------------------------------------------------------------- */
    /* 3. Custom Question modal — select "Address block" → live preview   */
    /* ---------------------------------------------------------------- */
    await ctx.clickText("Custom question"); // "+ Custom question"
    await ctx.sleep(600);
    await ctx.shot("04-custom-question-modal-open");

    const modal = page.locator("div.fixed.inset-0").last();
    // Question Type is the first <select> in the modal.
    await modal.locator("select").first().selectOption("address").catch((e) => {
      ctx.note(`Could not select address type: ${e}`);
    });
    await ctx.sleep(700);
    await ctx.shot("05-address-block-type-live-preview");

    // Close the modal
    await ctx.clickRole("button", "Cancel").catch(() => {});
    await ctx.sleep(500);

    /* ---------------------------------------------------------------- */
    /* 4. Waiver modal — drag-drop upload + template + acknowledgment     */
    /* ---------------------------------------------------------------- */
    await ctx.clickText("Waiver"); // "+ Waiver" top control
    await ctx.sleep(700);
    await ctx.shot("06-waiver-modal-open");

    // Edit the existing seeded waiver to show the populated edit state too.
    await ctx.clickRole("button", "Cancel").catch(() => {});
    await ctx.sleep(400);

    /* ---------------------------------------------------------------- */
    /* 5. Family-facing render via the preview route                     */
    /* ---------------------------------------------------------------- */
    await ctx.goto(`/preview/semester/${semId}/register/form`);
    await ctx.sleep(2500);
    await ctx.shot("07-family-form-preview-top");

    // Fill the address block to show it working (street / city / state / zip).
    await page.getByPlaceholder("Street address").first().fill("123 Broadway").catch(() => {});
    await page.getByPlaceholder("City").first().fill("new york").catch(() => {});
    // state dropdown (aria-label="State")
    await page.getByLabel("State").first().selectOption("NY").catch(() => {});
    await page.getByPlaceholder("ZIP").first().fill("100011234").catch(() => {});
    await page.getByPlaceholder("City").first().blur().catch(() => {});
    await ctx.sleep(500);
    await ctx.shot("08-family-address-filled-autoformat");

    // Acknowledge the waiver.
    const ackBox = page.locator('input[type="checkbox"]').last();
    await ackBox.check().catch(() => {});
    await ctx.sleep(400);
    await ctx.shot("09-family-waiver-acknowledged");

    /* ---------------------------------------------------------------- */
    /* 6. Admin-register QuestionsStep (best-effort)                     */
    /* ---------------------------------------------------------------- */
    ctx.note(
      "Admin-register QuestionsStep only renders address/waiver for semesters whose form " +
        "contains them. Existing published semesters predate this change, so this step may " +
        "show an older form — included for completeness.",
    );
    await ctx.goto("/admin/register");
    await ctx.sleep(1000);
    await ctx.shot("10-admin-register-landing");
  },
};

/*
 * Scenario template — copy this to <your-flow>.cjs and fill in run().
 *   node .claude/skills/run-harness/harness.cjs <your-flow>
 *
 * `ctx` gives you helpers + the raw Playwright `page` (escape hatch for
 * anything the helpers don't cover). Screenshots land in
 * tests/reports/harness-shots/<name>/ as NN-label.png; notes go to notes.txt.
 *
 * ctx API:
 *   ctx.page                      raw Playwright Page
 *   ctx.BASE                      base URL (e.g. http://localhost:3000)
 *   ctx.role                      logged-in role
 *   await ctx.goto(path)          navigate (path or full URL), waits networkidle
 *   await ctx.shot(label)         numbered full-page screenshot
 *   ctx.note(msg)                 record a line in notes.txt + stdout
 *   await ctx.sleep(ms)           wait
 *   await ctx.clickRole(role, name)   getByRole(role,{name}).click()
 *   await ctx.clickText(text)     click first element containing text
 *   await ctx.fillPlaceholder(ph, val)
 *   await ctx.fillNth(selector, n, val)   nth visible match
 *   await ctx.waitText(text)      wait for text to appear
 *   await ctx.exists(text)        -> boolean
 */
module.exports = {
  name: "my-flow",
  role: "admin", // admin | instructor | parent | none  (override with --role)
  async run(ctx) {
    await ctx.goto("/admin");          // navigate to the flow's entry point
    await ctx.shot("landing");
    // ... drive the flow, screenshotting each meaningful state ...
    // await ctx.clickRole("button", "Some Button");
    // await ctx.fillPlaceholder("Search…", "query");
    // await ctx.shot("after-action");
  },
};

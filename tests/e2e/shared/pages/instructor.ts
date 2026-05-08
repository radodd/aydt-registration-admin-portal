import { type Page, expect } from "@playwright/test";

/**
 * Page object for the /instructor portal.
 *
 * Add helpers as the e2e suite grows. Keep selectors anchored to roles +
 * accessible names whenever possible; fall back to data-testid when stable.
 */
export class InstructorPortal {
  constructor(private page: Page) {}

  async gotoHome() {
    await this.page.goto("/instructor");
  }

  async gotoClasses() {
    await this.page.goto("/instructor/classes");
  }

  async gotoProfile() {
    await this.page.goto("/instructor/profile");
  }

  async expectOnSetupPage() {
    await expect(this.page).toHaveURL(/\/instructor\/setup/);
  }

  async expectOnHome() {
    await expect(this.page).toHaveURL(/\/instructor(\/|$)/);
    // Home will eventually have stable copy. For now just assert we're past setup.
    await expect(this.page).not.toHaveURL(/\/instructor\/setup/);
  }

  /** Fill the password fields on /instructor/setup and submit. */
  async completeSetup(password: string) {
    await this.page.waitForURL(/\/instructor\/setup/, { timeout: 15_000 });
    // The setup page uses two password inputs side-by-side — match by index.
    const pwInputs = this.page.locator('input[type="password"], input[autocomplete="new-password"]');
    await expect(pwInputs.first()).toBeVisible();
    await pwInputs.nth(0).fill(password);
    await pwInputs.nth(1).fill(password);

    // The submit button label is "Create password & continue".
    await this.page.getByRole("button", { name: /create password/i }).click();

    // After completeInstructorSetup → /instructor.
    await this.page.waitForURL(/\/instructor(\/|$)(?!setup)/, { timeout: 15_000 });
  }
}

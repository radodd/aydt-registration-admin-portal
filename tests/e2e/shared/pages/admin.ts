import { type Page, expect } from "@playwright/test";

/**
 * Page object for the /admin portal. Stub for now — extend as admin specs
 * are added (instructors list, classes assign UI, etc.).
 */
export class AdminPortal {
  constructor(private page: Page) {}

  async gotoInstructors() {
    await this.page.goto("/admin/instructors");
  }

  async gotoClasses() {
    await this.page.goto("/admin/classes");
  }

  async expectOnAdmin() {
    await expect(this.page).toHaveURL(/\/admin(\/|$)/);
  }
}

import { test, expect } from "@playwright/test";
import {
  generateInviteLink,
  deleteUser,
  getUserStatus,
} from "../shared/db";
import { inviteLinkToAppPath, signIn } from "../shared/auth";
import { InstructorPortal } from "../shared/pages/instructor";

/**
 * Instructor onboarding — invite → set password → land on /instructor.
 *
 * Skips real email by using auth.admin.generateLink and following the
 * resulting action link directly.
 */
test.describe("@instructor @smoke instructor onboarding", () => {
  // Each test gets a fresh email so they're independent and parallel-safe.
  const uniqueEmail = () =>
    `e2e-instructor-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.test`;

  test("invited instructor sets password and lands on /instructor", async ({ page }) => {
    const email     = uniqueEmail();
    const firstName = "E2E";
    const lastName  = "Instructor";
    const password  = "PlaywrightTest123!";

    // 1. Admin invites (via service-role; same shape as createInstructor action).
    const { id: userId, actionLink } = await generateInviteLink({
      email, firstName, lastName,
    });

    try {
      // Sanity: status should be 'invited' immediately after.
      expect(await getUserStatus(userId)).toBe("invited");

      // 2. Instructor follows the invite — drops them at /instructor/setup.
      const appPath = inviteLinkToAppPath(actionLink);
      await page.goto(appPath);

      const portal = new InstructorPortal(page);
      await portal.expectOnSetupPage();

      // 3. Set password and submit.
      await portal.completeSetup(password);
      await portal.expectOnHome();

      // 4. Status should now be 'active'.
      await expect.poll(() => getUserStatus(userId), { timeout: 5_000 }).toBe("active");
    } finally {
      await deleteUser(userId);
    }
  });

  test("invited instructor can sign in again with their new password", async ({ page }) => {
    const email     = uniqueEmail();
    const password  = "PlaywrightTest123!";

    const { id: userId, actionLink } = await generateInviteLink({
      email, firstName: "Repeat", lastName: "Sign-in",
    });

    try {
      const portal = new InstructorPortal(page);

      // Complete the invite flow.
      await page.goto(inviteLinkToAppPath(actionLink));
      await portal.completeSetup(password);
      await portal.expectOnHome();

      // Clear cookies and sign in fresh.
      await page.context().clearCookies();
      await signIn(page, email, password);

      // Should be back inside the portal.
      await expect(page).not.toHaveURL(/\/auth/);
    } finally {
      await deleteUser(userId);
    }
  });
});

import { type Page, expect } from "@playwright/test";

/**
 * Sign in via the public /auth login form. Verifies redirect away from /auth.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/auth");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);

  // Submit by pressing Enter inside the password field — works regardless of
  // whether the button is a <button type="submit"> or click-handler.
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/auth/login") && !url.pathname.endsWith("/auth"), {
      timeout: 10_000,
    }),
    page.locator("#login-password").press("Enter"),
  ]);
}

export async function signOut(page: Page): Promise<void> {
  // Clear cookies — fastest deterministic sign-out in tests.
  await page.context().clearCookies();
}

/**
 * Convert a Supabase invite action link (server URL) into the app-side path.
 * generateLink returns an action_link like:
 *   https://<project>.supabase.co/auth/v1/verify?token=...&type=invite&redirect_to=...
 * but our email template uses /auth/confirm?token_hash=...&type=invite&next=/instructor/setup.
 * We extract the hashed_token + use the app path so the test mirrors the real flow.
 */
export function inviteLinkToAppPath(actionLink: string): string {
  const u = new URL(actionLink);
  const hashedToken = u.searchParams.get("hashed_token") ?? u.searchParams.get("token_hash");
  if (!hashedToken) {
    throw new Error(`Could not find token_hash in invite link: ${actionLink}`);
  }
  return `/auth/confirm?token_hash=${hashedToken}&type=invite&next=/instructor/setup`;
}

/** Assert the current URL pathname equals or starts with the given prefix. */
export async function expectPath(page: Page, prefix: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toMatch(new RegExp(`^${prefix.replace(/\//g, "\\/")}`));
}

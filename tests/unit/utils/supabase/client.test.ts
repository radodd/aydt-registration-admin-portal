import { createBrowserClient } from "@supabase/ssr";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the createBrowserClient function from the @/supabase/ssr module
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(),
}));

import { createClient } from "@/utils/supabase/client";

// Tests for createClient function in browser environment
describe("createClient (browser)", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...OLD_ENV };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });
  // Test that createBrowserClient is called with correct parameters
  it("calls createBrowserClient with env URL and anon key", () => {
    createClient();

    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key"
    );
  });
  // Test that createClient throws an error if environment variables are missing
  it("throws if env vars are missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = undefined as never;

    expect(() => createClient()).toThrowError();
  });
});

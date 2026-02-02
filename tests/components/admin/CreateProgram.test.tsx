import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

// Track Supabase insert calls
const insertMock = vi.fn().mockResolvedValue({ error: null });
// Mock the createClient function from the utils/supabase/client module
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: insertMock,
    }),
  }),
}));

// Mock alert
vi.stubGlobal("alert", vi.fn());

import CreateProgram from "@/app/admin/programs/(components)/CreateProgram";

describe("CreateProgram — basic render", () => {
  it("renders without crashing", () => {
    render(<CreateProgram />);

    // The simplest possible assertion
    expect(screen.getByTestId("title")).toBeInTheDocument();
  });
});

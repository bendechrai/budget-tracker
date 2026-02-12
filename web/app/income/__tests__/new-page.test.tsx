import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewIncomePage from "../new/page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

describe("NewIncomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the page title and form", () => {
    render(<NewIncomePage />);

    expect(
      screen.getByRole("heading", { name: "Add Income Source" })
    ).toBeDefined();
    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add Income Source" })
    ).toBeDefined();
  });

  it("creates an income source and redirects", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<NewIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "5000");

    await user.click(
      screen.getByRole("button", { name: "Add Income Source" })
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/income");
    });

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/income-sources",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("shows an error when API returns an error", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<NewIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "5000");

    await user.click(
      screen.getByRole("button", { name: "Add Income Source" })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("name is required");
    });
  });
});

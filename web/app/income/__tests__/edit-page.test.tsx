import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditIncomePage from "../edit/[id]/page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockIncomeSource = {
  id: "1",
  name: "Salary",
  expectedAmount: 5000,
  frequency: "monthly",
  frequencyDays: null,
  isIrregular: false,
  minimumExpected: null,
  nextExpectedDate: "2026-03-01T00:00:00.000Z",
  isPaused: false,
};

describe("EditIncomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and displays the income source in the form", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([mockIncomeSource]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<EditIncomePage params={Promise.resolve({ id: "1" })} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Edit Income Source" })
      ).toBeDefined();
    });

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Salary"
    );
    expect(
      (screen.getByLabelText("Expected Amount") as HTMLInputElement).value
    ).toBe("5000");
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeDefined();
  });

  it("shows an error when income source is not found", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<EditIncomePage params={Promise.resolve({ id: "nonexistent" })} />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Income source not found"
      );
    });
  });

  it("updates income source and redirects", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify([mockIncomeSource]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...mockIncomeSource, name: "Updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<EditIncomePage params={Promise.resolve({ id: "1" })} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toBeDefined();
    });

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Updated Salary");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/income");
    });

    expect(vi.mocked(global.fetch)).toHaveBeenLastCalledWith(
      "/api/income-sources/1",
      expect.objectContaining({
        method: "PUT",
      })
    );
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));

    render(<EditIncomePage params={Promise.resolve({ id: "1" })} />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockSettings = {
  email: "user@example.com",
  contributionCycleType: null,
  contributionPayDays: [],
  currencySymbol: "$",
  maxContributionPerCycle: null,
  autoDetectedCycle: { type: "monthly", payDays: [1] },
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    render(<SettingsPage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the page title", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    expect(
      screen.getByRole("heading", { name: "Settings" })
    ).toBeDefined();
  });

  it("shows error when settings fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load settings"
      );
    });
  });

  it("renders all four section headings", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Profile/ })).toBeDefined();
    });

    expect(screen.getByRole("button", { name: /Budget Preferences/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Funds/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Account/ })).toBeDefined();
  });

  it("only the first section is expanded by default", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Profile/ })).toBeDefined();
    });

    expect(
      screen.getByRole("button", { name: /Profile/ }).getAttribute("aria-expanded")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /Budget Preferences/ }).getAttribute("aria-expanded")
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: /Funds/ }).getAttribute("aria-expanded")
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: /^Account/ }).getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("opening a section closes the previously open one", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Profile/ })).toBeDefined();
    });

    // Profile starts expanded
    expect(
      screen.getByRole("button", { name: /Profile/ }).getAttribute("aria-expanded")
    ).toBe("true");

    // Click Budget Preferences — it opens, Profile closes
    await user.click(screen.getByRole("button", { name: /Budget Preferences/ }));

    expect(
      screen.getByRole("button", { name: /Profile/ }).getAttribute("aria-expanded")
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: /Budget Preferences/ }).getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("clicking the open section collapses it (all closed)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Profile/ })).toBeDefined();
    });

    // Click Profile to collapse it
    await user.click(screen.getByRole("button", { name: /Profile/ }));

    expect(
      screen.getByRole("button", { name: /Profile/ }).getAttribute("aria-expanded")
    ).toBe("false");
  });
});

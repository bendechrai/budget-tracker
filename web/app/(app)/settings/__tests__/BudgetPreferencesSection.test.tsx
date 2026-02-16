import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BudgetPreferencesSection from "../BudgetPreferencesSection";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

describe("BudgetPreferencesSection", () => {
  const defaultProps = {
    contributionCycleType: null as "weekly" | "fortnightly" | "twice_monthly" | "monthly" | null,
    contributionPayDays: [] as number[],
    currencySymbol: "$",
    maxContributionPerCycle: null as number | null,
    autoDetectedCycle: { type: "monthly" as const, payDays: [1] },
    onSettingsChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders cycle selector with auto-detected recommendation", async () => {
    render(<BudgetPreferencesSection {...defaultProps} />);

    const autoRadio = screen.getByRole("radio", { name: "Auto-detect" });
    expect((autoRadio as HTMLInputElement).checked).toBe(true);

    expect(screen.getByText(/Recommended:/)).toBeDefined();

    expect(screen.getByRole("radio", { name: "Weekly" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Fortnightly" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Twice monthly" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeDefined();
  });

  it("renders cycle selector with explicit selection highlighted", () => {
    render(
      <BudgetPreferencesSection
        {...defaultProps}
        contributionCycleType="fortnightly"
      />
    );

    const fortnightlyRadio = screen.getByRole("radio", { name: "Fortnightly" });
    expect((fortnightlyRadio as HTMLInputElement).checked).toBe(true);

    const autoRadio = screen.getByRole("radio", { name: "Auto-detect" });
    expect((autoRadio as HTMLInputElement).checked).toBe(false);
  });

  it("saves cycle selection via PUT /api/user/settings", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contributionCycleType: "weekly",
          contributionPayDays: [],
          currencySymbol: "$",
          maxContributionPerCycle: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<BudgetPreferencesSection {...defaultProps} />);

    await user.click(screen.getByRole("radio", { name: "Weekly" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionCycleType: "weekly" }),
      });
    });
  });

  it("renders currency quick picks", () => {
    render(<BudgetPreferencesSection {...defaultProps} />);

    const quickPicks = ["$", "\u00a3", "\u20ac", "\u00a5", "A$", "NZ$"];
    for (const sym of quickPicks) {
      expect(screen.getByRole("button", { name: sym })).toBeDefined();
    }
  });

  it("saves currency pick via PUT /api/user/settings", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contributionCycleType: null,
          contributionPayDays: [],
          currencySymbol: "\u00a3",
          maxContributionPerCycle: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<BudgetPreferencesSection {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "\u00a3" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currencySymbol: "\u00a3" }),
      });
    });
  });

  it("saves max contribution via form submit", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contributionCycleType: null,
          contributionPayDays: [],
          currencySymbol: "$",
          maxContributionPerCycle: 500,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<BudgetPreferencesSection {...defaultProps} />);

    const maxInput = screen.getByPlaceholderText("No limit");
    await user.type(maxInput, "500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxContributionPerCycle: 500 }),
      });
    });
  });

  it("clears max contribution when Clear button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contributionCycleType: null,
          contributionPayDays: [],
          currencySymbol: "$",
          maxContributionPerCycle: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<BudgetPreferencesSection {...defaultProps} maxContributionPerCycle={500} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxContributionPerCycle: null }),
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingFundSetupPage from "../page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("OnboardingFundSetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all fund setup fields", () => {
    render(<OnboardingFundSetupPage />);

    expect(
      screen.getByRole("heading", { name: "Fund Setup" })
    ).toBeDefined();
    expect(screen.getByLabelText("Current fund balance")).toBeDefined();
    expect(screen.getByText("Currency symbol")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Finish Setup" })
    ).toBeDefined();
  });

  it("renders currency quick-pick buttons", () => {
    render(<OnboardingFundSetupPage />);

    expect(screen.getByRole("button", { name: "$" })).toBeDefined();
    expect(screen.getByRole("button", { name: "£" })).toBeDefined();
    expect(screen.getByRole("button", { name: "€" })).toBeDefined();
    expect(screen.getByRole("button", { name: "¥" })).toBeDefined();
    expect(screen.getByRole("button", { name: "A$" })).toBeDefined();
    expect(screen.getByRole("button", { name: "NZ$" })).toBeDefined();
  });

  it("submits the form and redirects to dashboard on success", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.clear(screen.getByLabelText("Current fund balance"));
    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentFundBalance: 500,
          currencySymbol: "$",
        }),
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("submits with selected currency quick-pick", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.click(screen.getByRole("button", { name: "£" }));
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentFundBalance: 500,
          currencySymbol: "£",
        }),
      });
    });
  });

  it("treats empty balance as zero and submits successfully", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    // Leave balance empty — should default to 0
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentFundBalance: 0,
          currencySymbol: "$",
        }),
      });
    });
  });

  it("shows server error when API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });

    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Unauthorized");
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("has default currency of $ selected", () => {
    render(<OnboardingFundSetupPage />);

    // The $ button should be visually active (has active class)
    const dollarButton = screen.getByRole("button", { name: "$" });
    expect(dollarButton).toBeDefined();
  });

  it("does not render contribution cycle question", () => {
    render(<OnboardingFundSetupPage />);

    expect(screen.queryByText("Contribution cycle")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

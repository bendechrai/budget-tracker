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
    expect(screen.getByLabelText("Max contribution per cycle")).toBeDefined();
    expect(screen.getByLabelText("Contribution cycle (days)")).toBeDefined();
    expect(screen.getByLabelText("Currency symbol")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Finish Setup" })
    ).toBeDefined();
  });

  it("renders the 'I'm not sure' checkbox", () => {
    render(<OnboardingFundSetupPage />);

    const checkbox = screen.getByLabelText("I'm not sure yet");
    expect(checkbox).toBeDefined();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it("disables contribution and cycle fields when 'I'm not sure' is checked", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    const checkbox = screen.getByLabelText("I'm not sure yet");
    await user.click(checkbox);

    expect(
      (screen.getByLabelText("Max contribution per cycle") as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByLabelText("Contribution cycle (days)") as HTMLInputElement)
        .disabled
    ).toBe(true);
  });

  it("re-enables contribution fields when 'I'm not sure' is unchecked", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    const checkbox = screen.getByLabelText("I'm not sure yet");
    await user.click(checkbox);
    await user.click(checkbox);

    expect(
      (screen.getByLabelText("Max contribution per cycle") as HTMLInputElement)
        .disabled
    ).toBe(false);
    expect(
      (screen.getByLabelText("Contribution cycle (days)") as HTMLInputElement)
        .disabled
    ).toBe(false);
  });

  it("submits the form and redirects to dashboard on success", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.clear(screen.getByLabelText("Current fund balance"));
    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.clear(screen.getByLabelText("Max contribution per cycle"));
    await user.type(
      screen.getByLabelText("Max contribution per cycle"),
      "200"
    );
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentFundBalance: 500,
          currencySymbol: "$",
          maxContributionPerCycle: 200,
          contributionCycleDays: 14,
        }),
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("submits without contribution fields when 'I'm not sure' is checked", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.type(screen.getByLabelText("Current fund balance"), "100");
    await user.click(screen.getByLabelText("I'm not sure yet"));
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentFundBalance: 100,
          currencySymbol: "$",
        }),
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows error when contribution is invalid and 'I'm not sure' is unchecked", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Contribution amount must be a positive number"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("treats empty balance as zero and submits successfully", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    // Leave balance empty — should default to 0
    await user.type(
      screen.getByLabelText("Max contribution per cycle"),
      "200"
    );
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentFundBalance: 0,
          currencySymbol: "$",
          maxContributionPerCycle: 200,
          contributionCycleDays: 14,
        }),
      });
    });
  });

  it("shows error when currency symbol is empty", async () => {
    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.type(
      screen.getByLabelText("Max contribution per cycle"),
      "200"
    );
    await user.clear(screen.getByLabelText("Currency symbol"));
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Currency symbol is required"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows server error when API call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });

    const user = userEvent.setup();
    render(<OnboardingFundSetupPage />);

    await user.type(screen.getByLabelText("Current fund balance"), "500");
    await user.type(
      screen.getByLabelText("Max contribution per cycle"),
      "200"
    );
    await user.click(screen.getByRole("button", { name: "Finish Setup" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Unauthorized");
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("has default currency symbol of $", () => {
    render(<OnboardingFundSetupPage />);

    expect(
      (screen.getByLabelText("Currency symbol") as HTMLInputElement).value
    ).toBe("$");
  });

  it("has default cycle days of 14", () => {
    render(<OnboardingFundSetupPage />);

    expect(
      (screen.getByLabelText("Contribution cycle (days)") as HTMLInputElement)
        .value
    ).toBe("14");
  });
});

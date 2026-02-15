import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingManualIncomePage from "../page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("OnboardingManualIncomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the income form with name, amount, and frequency fields", () => {
    render(<OnboardingManualIncomePage />);

    expect(
      screen.getByRole("heading", { name: "Income Sources" })
    ).toBeDefined();
    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Amount")).toBeDefined();
    expect(screen.getByLabelText("Frequency")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add income source" })
    ).toBeDefined();
  });

  it("adds an income entry when the form is submitted with valid data", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect(screen.getByText("Salary")).toBeDefined();
    expect(screen.getByText("$5000 / monthly")).toBeDefined();
  });

  it("shows an error when name is empty", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect(screen.getByRole("alert").textContent).toBe("Name is required");
  });

  it("shows an error when amount is invalid", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Amount must be a positive number"
    );
  });

  it("removes an income entry when remove button is clicked", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect(screen.getByText("Salary")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Remove Salary" }));

    expect(screen.queryByText("Salary")).toBeNull();
  });

  it("clears form fields after adding an entry", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
  });

  it("navigates to obligations step on continue", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.click(
      screen.getByRole("button", { name: "Continue without income" })
    );

    expect(mockPush).toHaveBeenCalledWith("/onboarding/manual/obligations");
  });

  it("shows 'Continue' button text when entries exist", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("renders skip link to obligations", () => {
    render(<OnboardingManualIncomePage />);

    const skipLink = screen.getByRole("link", { name: /Skip to obligations/ });
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("/onboarding/manual/obligations");
  });

  it("allows selecting different frequencies", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualIncomePage />);

    await user.type(screen.getByLabelText("Name"), "Freelance");
    await user.type(screen.getByLabelText("Amount"), "2000");
    await user.selectOptions(screen.getByLabelText("Frequency"), "weekly");
    await user.click(screen.getByRole("button", { name: "Add income source" }));

    expect(screen.getByText("$2000 / weekly")).toBeDefined();
  });

  it("renders 'Twice monthly' option in frequency dropdown", () => {
    render(<OnboardingManualIncomePage />);

    const frequencySelect = screen.getByLabelText("Frequency") as HTMLSelectElement;
    const options = Array.from(frequencySelect.options).map((o) => o.value);
    expect(options).toContain("twice_monthly");

    const twiceMonthlyOption = Array.from(frequencySelect.options).find(
      (o) => o.value === "twice_monthly"
    );
    expect(twiceMonthlyOption?.textContent).toBe("Twice monthly");
  });
});

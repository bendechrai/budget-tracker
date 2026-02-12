import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingManualObligationsPage from "../page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("OnboardingManualObligationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the obligations form with name, amount, frequency, and due date fields", () => {
    render(<OnboardingManualObligationsPage />);

    expect(
      screen.getByRole("heading", { name: "Obligations" })
    ).toBeDefined();
    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Amount")).toBeDefined();
    expect(screen.getByLabelText("Frequency")).toBeDefined();
    expect(screen.getByLabelText("Next due date (optional)")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add obligation" })
    ).toBeDefined();
  });

  it("adds an obligation entry when the form is submitted with valid data", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "1500");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByText("Rent")).toBeDefined();
    expect(screen.getByText("$1500 / monthly")).toBeDefined();
  });

  it("shows due date in entry detail when provided", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Insurance");
    await user.type(screen.getByLabelText("Amount"), "200");
    await user.type(screen.getByLabelText("Next due date (optional)"), "2026-03-15");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByText("Insurance")).toBeDefined();
    expect(
      screen.getByText("$200 / monthly — due 2026-03-15")
    ).toBeDefined();
  });

  it("shows an error when name is empty", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Amount"), "1500");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByRole("alert").textContent).toBe("Name is required");
  });

  it("shows an error when amount is invalid", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Amount must be a positive number"
    );
  });

  it("removes an obligation entry when remove button is clicked", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "1500");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByText("Rent")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Remove Rent" }));

    expect(screen.queryByText("Rent")).toBeNull();
  });

  it("clears form fields after adding an entry", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "1500");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(
      ""
    );
    expect(
      (screen.getByLabelText("Next due date (optional)") as HTMLInputElement)
        .value
    ).toBe("");
  });

  it("navigates to fund setup step on continue", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue without obligations" })
    );

    expect(mockPush).toHaveBeenCalledWith("/onboarding/fund-setup");
  });

  it("shows 'Continue' button text when entries exist", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "1500");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("renders skip link to fund setup", () => {
    render(<OnboardingManualObligationsPage />);

    const skipLink = screen.getByRole("link", { name: /Skip to fund setup/ });
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("/onboarding/fund-setup");
  });

  it("allows selecting different frequencies", async () => {
    const user = userEvent.setup();
    render(<OnboardingManualObligationsPage />);

    await user.type(screen.getByLabelText("Name"), "Insurance");
    await user.type(screen.getByLabelText("Amount"), "600");
    await user.selectOptions(screen.getByLabelText("Frequency"), "quarterly");
    await user.click(screen.getByRole("button", { name: "Add obligation" }));

    expect(screen.getByText("$600 / quarterly")).toBeDefined();
  });
});

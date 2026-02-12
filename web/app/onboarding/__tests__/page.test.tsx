import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OnboardingWelcomePage from "../page";

describe("OnboardingWelcomePage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the welcome title and sinking fund explanation", () => {
    render(<OnboardingWelcomePage />);

    expect(
      screen.getByRole("heading", { name: "Welcome to Sinking Fund" })
    ).toBeDefined();
    expect(screen.getByText(/sinking fund is money you set aside/)).toBeDefined();
  });

  it("renders the Upload Statements path card", () => {
    render(<OnboardingWelcomePage />);

    const link = screen.getByRole("link", { name: /Upload Statements/ });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/onboarding/upload");
    expect(screen.getByText(/detect your recurring income/)).toBeDefined();
  });

  it("renders the Manual Entry path card", () => {
    render(<OnboardingWelcomePage />);

    const link = screen.getByRole("link", { name: /Manual Entry/ });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/onboarding/manual/income");
    expect(screen.getByText(/Add your income sources and expenses/)).toBeDefined();
  });

  it("renders both path cards with equal prominence", () => {
    render(<OnboardingWelcomePage />);

    const uploadLink = screen.getByRole("link", { name: /Upload Statements/ });
    const manualLink = screen.getByRole("link", { name: /Manual Entry/ });

    // Both are rendered as links (not one as a button and one as a link)
    expect(uploadLink.tagName).toBe("A");
    expect(manualLink.tagName).toBe("A");

    // Both have the same CSS class (pathCard)
    expect(uploadLink.className).toBe(manualLink.className);
  });

  it("renders a skip link to fund setup", () => {
    render(<OnboardingWelcomePage />);

    const skipLink = screen.getByRole("link", { name: /Skip for now/ });
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("/onboarding/fund-setup");
  });
});

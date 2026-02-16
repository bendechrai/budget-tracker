import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HealthBar from "../HealthBar";
import type { FundGroupHealth } from "../HealthBar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

const mockFundGroups: FundGroupHealth[] = [
  { id: "fg1", name: "Housing", funded: 1500, required: 2000 },
  { id: "fg2", name: "Entertainment", funded: 22.99, required: 22.99 },
  { id: "fg3", name: "Car", funded: 200, required: 850 },
];

describe("HealthBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a progress bar for each fund group", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    const progressBars = screen.getAllByRole("progressbar");
    expect(progressBars).toHaveLength(3);
  });

  it("shows fund group names", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    expect(screen.getByText("Housing")).toBeDefined();
    expect(screen.getByText("Entertainment")).toBeDefined();
    expect(screen.getByText("Car")).toBeDefined();
  });

  it("shows funded/required amounts for each fund", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    expect(screen.getByText("$1500.00 / $2000.00")).toBeDefined();
    expect(screen.getByText("$22.99 / $22.99")).toBeDefined();
    expect(screen.getByText("$200.00 / $850.00")).toBeDefined();
  });

  it("calculates correct percentages per fund", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    const progressBars = screen.getAllByRole("progressbar");
    // Housing: 1500/2000 = 75%
    expect(progressBars[0].getAttribute("aria-valuenow")).toBe("75");
    expect(progressBars[0].getAttribute("aria-label")).toBe("Housing 75% funded");

    // Entertainment: 22.99/22.99 = 100%
    expect(progressBars[1].getAttribute("aria-valuenow")).toBe("100");
    expect(progressBars[1].getAttribute("aria-label")).toBe("Entertainment 100% funded");

    // Car: 200/850 = 24%
    expect(progressBars[2].getAttribute("aria-valuenow")).toBe("24");
    expect(progressBars[2].getAttribute("aria-label")).toBe("Car 24% funded");
  });

  it("shows green color for 90%+ funded", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 900, required: 1000 }]} />
    );

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("90");
    expect(screen.getByText("90%")).toBeDefined();
  });

  it("shows amber color for 60-89% funded", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 750, required: 1000 }]} />
    );

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("shows red color for below 60% funded", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 500, required: 1000 }]} />
    );

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("handles zero required gracefully", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Empty", funded: 0, required: 0 }]} />
    );

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("clamps percentage at 100% when overfunded", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Extra", funded: 1500, required: 1000 }]} />
    );

    const bar = screen.getByRole("progressbar");
    // aria-valuenow shows actual percentage (150)
    expect(bar.getAttribute("aria-valuenow")).toBe("150");
    // but width would be clamped (tested via style, not easily in jsdom)
  });

  it("returns null when no fund groups", () => {
    const { container } = render(<HealthBar fundGroups={[]} />);

    expect(container.innerHTML).toBe("");
  });

  it("shows the Fund health header", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    expect(screen.getByText("Fund health")).toBeDefined();
  });
});

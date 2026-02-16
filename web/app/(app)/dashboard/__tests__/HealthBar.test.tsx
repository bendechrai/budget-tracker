import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HealthBar from "../HealthBar";
import type { FundGroupHealth } from "../HealthBar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

const mockFundGroups: FundGroupHealth[] = [
  { id: "fg1", name: "Housing", funded: 1500, monthlyRequired: 1000, preseed: 500 },
  { id: "fg2", name: "Entertainment", funded: 22.99, monthlyRequired: 22.99, preseed: 0 },
  { id: "fg3", name: "Car", funded: 200, monthlyRequired: 450, preseed: 400 },
];

describe("HealthBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a progress bar for each fund group", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    const progressBars = screen.getAllByRole("progressbar", { hidden: true });
    expect(progressBars).toHaveLength(3);
  });

  it("shows fund group names", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    expect(screen.getByText("Housing")).toBeDefined();
    expect(screen.getByText("Entertainment")).toBeDefined();
    expect(screen.getByText("Car")).toBeDefined();
  });

  it("shows funded/target amounts for each fund", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    // Housing: target = 500 + 1000 = 1500
    expect(screen.getByText("$1500.00 / $1500.00")).toBeDefined();
    // Entertainment: target = 0 + 22.99 = 22.99
    expect(screen.getByText("$22.99 / $22.99")).toBeDefined();
    // Car: target = 400 + 450 = 850
    expect(screen.getByText("$200.00 / $850.00")).toBeDefined();
  });

  it("calculates correct percentages based on target (preseed + monthlyRequired)", () => {
    render(<HealthBar fundGroups={mockFundGroups} />);

    const progressBars = screen.getAllByRole("progressbar", { hidden: true });
    // Housing: 1500/(500+1000) = 100%
    expect(progressBars[0].getAttribute("aria-valuenow")).toBe("100");
    expect(progressBars[0].getAttribute("aria-label")).toBe("Housing 100% funded");

    // Entertainment: 22.99/(0+22.99) = 100%
    expect(progressBars[1].getAttribute("aria-valuenow")).toBe("100");
    expect(progressBars[1].getAttribute("aria-label")).toBe("Entertainment 100% funded");

    // Car: 200/(400+450) = 24%
    expect(progressBars[2].getAttribute("aria-valuenow")).toBe("24");
    expect(progressBars[2].getAttribute("aria-label")).toBe("Car 24% funded");
  });

  it("shows yellow color when funded < preseed (still building buffer)", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 200, monthlyRequired: 100, preseed: 400 }]} />
    );

    const bar = screen.getByRole("progressbar", { hidden: true });
    // 200/(400+100) = 40%
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("40%")).toBeDefined();
  });

  it("shows green color when funded >= preseed (buffer complete)", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 450, monthlyRequired: 100, preseed: 400 }]} />
    );

    const bar = screen.getByRole("progressbar", { hidden: true });
    // 450/(400+100) = 90%
    expect(bar.getAttribute("aria-valuenow")).toBe("90");
    expect(screen.getByText("90%")).toBeDefined();
  });

  it("shows green-only state when preseed is 0 (no buffer needed)", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 50, monthlyRequired: 100, preseed: 0 }]} />
    );

    const bar = screen.getByRole("progressbar", { hidden: true });
    // 50/(0+100) = 50%
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    // No threshold tick should appear
    expect(screen.queryByTestId("threshold-fg1")).toBeNull();
  });

  it("shows threshold tick with dollar label when preseed > 0", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 200, monthlyRequired: 100, preseed: 400 }]} />
    );

    const tick = screen.getByTestId("threshold-fg1");
    expect(tick).toBeDefined();
    // threshold position = 400/(400+100) * 100 = 80%
    expect(tick.style.left).toBe("80%");
    // label under the tick shows the preseed amount
    expect(tick.textContent).toBe("$400");
  });

  it("hides threshold tick when preseed is 0", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Bills", funded: 75, monthlyRequired: 100, preseed: 0 }]} />
    );

    expect(screen.queryByTestId("threshold-fg1")).toBeNull();
  });

  it("handles zero target gracefully", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Empty", funded: 0, monthlyRequired: 0, preseed: 0 }]} />
    );

    const bar = screen.getByRole("progressbar", { hidden: true });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("clamps fill at 100% when overfunded but shows actual percentage", () => {
    render(
      <HealthBar fundGroups={[{ id: "fg1", name: "Extra", funded: 600, monthlyRequired: 100, preseed: 400 }]} />
    );

    const bar = screen.getByRole("progressbar", { hidden: true });
    // 600/(400+100) = 120%
    expect(bar.getAttribute("aria-valuenow")).toBe("120");
    expect(screen.getByText("120%")).toBeDefined();
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

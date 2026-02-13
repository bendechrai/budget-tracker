import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import HealthBar from "../HealthBar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockObligations = [
  {
    id: "ob1",
    name: "Rent",
    amount: 2000,
    fundGroupId: "fg1",
    fundGroup: { id: "fg1", name: "Housing" },
    fundBalance: { currentBalance: 1500 },
  },
  {
    id: "ob2",
    name: "Netflix",
    amount: 22.99,
    fundGroupId: "fg2",
    fundGroup: { id: "fg2", name: "Entertainment" },
    fundBalance: { currentBalance: 22.99 },
  },
  {
    id: "ob3",
    name: "Car Rego",
    amount: 850,
    fundGroupId: null,
    fundGroup: null,
    fundBalance: { currentBalance: 200 },
  },
];

describe("HealthBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the progress bar with correct percentage", () => {
    render(<HealthBar totalFunded={3200} totalRequired={4100} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeDefined();
    expect(progressBar.getAttribute("aria-valuenow")).toBe("78");
    expect(progressBar.getAttribute("aria-label")).toBe("78% funded");
  });

  it("shows absolute amounts", () => {
    render(<HealthBar totalFunded={3200} totalRequired={4100} />);

    expect(
      screen.getByText("$3200.00 of $4100.00 set aside")
    ).toBeDefined();
  });

  it("shows green color when funding is at 90% or above", () => {
    render(<HealthBar totalFunded={9000} totalRequired={10000} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("90");
    expect(screen.getByText("90%")).toBeDefined();
  });

  it("shows amber color when funding is between 60% and 89%", () => {
    render(<HealthBar totalFunded={7500} totalRequired={10000} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("75");
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("shows red color when funding is below 60%", () => {
    render(<HealthBar totalFunded={5000} totalRequired={10000} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("handles zero total required gracefully", () => {
    render(<HealthBar totalFunded={0} totalRequired={0} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("expands to show group breakdown on click", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<HealthBar totalFunded={1722.99} totalRequired={2872.99} />);

    const expandButton = screen.getByRole("button");
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandButton);

    expect(expandButton.getAttribute("aria-expanded")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("Housing")).toBeDefined();
    });

    expect(screen.getByText("Entertainment")).toBeDefined();
    expect(screen.getByText("Ungrouped")).toBeDefined();
  });

  it("shows per-group funded amounts in breakdown", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<HealthBar totalFunded={1722.99} totalRequired={2872.99} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("$1500.00 / $2000.00")).toBeDefined();
    });

    expect(screen.getByText("$22.99 / $22.99")).toBeDefined();
    expect(screen.getByText("$200.00 / $850.00")).toBeDefined();
  });

  it("shows no groups message when obligations list is empty", async () => {
    vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse([]));

    render(<HealthBar totalFunded={0} totalRequired={0} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(
        screen.getByText("No obligations to break down")
      ).toBeDefined();
    });
  });

  it("collapses breakdown on second click", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockFetchResponse(mockObligations)
    );

    render(<HealthBar totalFunded={1722.99} totalRequired={2872.99} />);

    const button = screen.getByRole("button");

    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText("Housing")).toBeDefined();
    });

    fireEvent.click(button);
    expect(screen.queryByText("Housing")).toBeNull();
  });

  it("applies green threshold at exactly 90%", () => {
    render(<HealthBar totalFunded={900} totalRequired={1000} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("90");
  });

  it("applies amber threshold at exactly 60%", () => {
    render(<HealthBar totalFunded={600} totalRequired={1000} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("60");
  });

  it("applies red threshold at 59%", () => {
    render(<HealthBar totalFunded={590} totalRequired={1000} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("59");
  });

  it("displays scenario values when scenario props are provided", () => {
    render(
      <HealthBar
        totalFunded={3200}
        totalRequired={4100}
        scenarioTotalFunded={2000}
        scenarioTotalRequired={2100}
      />
    );

    // Should show scenario amounts, not actual
    expect(
      screen.getByText("$2000.00 of $2100.00 set aside")
    ).toBeDefined();

    // Scenario percentage: 2000/2100 = ~95%
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("95");
    expect(progressBar.getAttribute("aria-label")).toBe("95% funded");
  });

  it("shows scenario label when scenario props are provided", () => {
    render(
      <HealthBar
        totalFunded={3200}
        totalRequired={4100}
        scenarioTotalFunded={2000}
        scenarioTotalRequired={2100}
      />
    );

    expect(screen.getByText("Fund health (scenario)")).toBeDefined();
  });

  it("shows normal label when no scenario props", () => {
    render(<HealthBar totalFunded={3200} totalRequired={4100} />);

    expect(screen.getByText("Fund health")).toBeDefined();
  });
});

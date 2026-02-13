import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScenarioBanner from "../ScenarioBanner";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockResetAll = vi.fn();

let mockIsActive = false;
let mockChangeSummary = "";
let mockOverrides = {
  toggledOffIds: new Set<string>(),
  amountOverrides: new Map<string, number>(),
  hypotheticals: [] as Array<{
    id: string;
    name: string;
    type: string;
    amount: number;
    frequency: string | null;
    frequencyDays: number | null;
    nextDueDate: Date;
    endDate: Date | null;
    fundGroupId: string | null;
  }>,
};

vi.mock("@/app/contexts/WhatIfContext", () => ({
  useWhatIf: () => ({
    isActive: mockIsActive,
    changeSummary: mockChangeSummary,
    overrides: mockOverrides,
    resetAll: mockResetAll,
    toggleObligation: vi.fn(),
    overrideAmount: vi.fn(),
    addHypothetical: vi.fn(),
    removeHypothetical: vi.fn(),
  }),
}));

describe("ScenarioBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    );
    mockIsActive = false;
    mockChangeSummary = "";
    mockOverrides = {
      toggledOffIds: new Set<string>(),
      amountOverrides: new Map<string, number>(),
      hypotheticals: [],
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render when no what-if changes are active", () => {
    mockIsActive = false;
    render(<ScenarioBanner />);
    expect(screen.queryByTestId("scenario-banner")).toBeNull();
  });

  it("renders when what-if changes are active", () => {
    mockIsActive = true;
    mockChangeSummary = "1 expense toggled off";
    render(<ScenarioBanner />);
    expect(screen.getByTestId("scenario-banner")).toBeDefined();
    expect(screen.getByText("What-if scenario active")).toBeDefined();
    expect(screen.getByText("1 expense toggled off")).toBeDefined();
  });

  it("shows summary of all change types", () => {
    mockIsActive = true;
    mockChangeSummary = "2 expenses toggled off, 1 amount changed, 1 hypothetical added";
    render(<ScenarioBanner />);
    expect(
      screen.getByText("2 expenses toggled off, 1 amount changed, 1 hypothetical added")
    ).toBeDefined();
  });

  it("calls resetAll when Reset button is clicked", async () => {
    const user = userEvent.setup();
    mockIsActive = true;
    mockChangeSummary = "1 expense toggled off";
    render(<ScenarioBanner />);

    await user.click(screen.getByText("Reset"));
    expect(mockResetAll).toHaveBeenCalledTimes(1);
  });

  it("shows confirmation dialog when Apply is clicked", async () => {
    const user = userEvent.setup();
    mockIsActive = true;
    mockChangeSummary = "1 expense toggled off";
    mockOverrides = {
      toggledOffIds: new Set(["ob1"]),
      amountOverrides: new Map(),
      hypotheticals: [],
    };
    render(<ScenarioBanner />);

    await user.click(screen.getByText("Apply"));
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByText("Apply what-if changes?")).toBeDefined();
    expect(screen.getByText("Pause 1 obligation")).toBeDefined();
  });

  it("shows all change types in confirmation dialog", async () => {
    const user = userEvent.setup();
    mockIsActive = true;
    mockChangeSummary = "2 expenses toggled off, 1 amount changed, 1 hypothetical added";
    mockOverrides = {
      toggledOffIds: new Set(["ob1", "ob2"]),
      amountOverrides: new Map([["ob3", 50]]),
      hypotheticals: [
        {
          id: "hyp1",
          name: "Holiday",
          type: "one_off",
          amount: 2000,
          frequency: null,
          frequencyDays: null,
          nextDueDate: new Date("2026-12-01"),
          endDate: null,
          fundGroupId: null,
        },
      ],
    };
    render(<ScenarioBanner />);

    await user.click(screen.getByText("Apply"));
    expect(screen.getByText("Pause 2 obligations")).toBeDefined();
    expect(screen.getByText("Update 1 obligation amount")).toBeDefined();
    expect(screen.getByText("Create 1 new obligation")).toBeDefined();
  });

  it("dismisses confirmation dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    mockIsActive = true;
    mockChangeSummary = "1 expense toggled off";
    mockOverrides = {
      toggledOffIds: new Set(["ob1"]),
      amountOverrides: new Map(),
      hypotheticals: [],
    };
    render(<ScenarioBanner />);

    await user.click(screen.getByText("Apply"));
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("calls APIs and resets when Confirm is clicked", async () => {
    const user = userEvent.setup();
    mockIsActive = true;
    mockChangeSummary = "1 expense toggled off, 1 amount changed";
    mockOverrides = {
      toggledOffIds: new Set(["ob1"]),
      amountOverrides: new Map([["ob2", 75]]),
      hypotheticals: [],
    };

    // Mock window.location.reload
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });

    render(<ScenarioBanner />);

    await user.click(screen.getByText("Apply"));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(mockResetAll).toHaveBeenCalledTimes(1);
    });

    // Should have called PUT for pause and PUT for amount
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/obligations/ob1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ isPaused: true }),
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/obligations/ob2",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ amount: 75 }),
      })
    );

    // Restore
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("creates obligations for hypotheticals when applying", async () => {
    const user = userEvent.setup();
    mockIsActive = true;
    mockChangeSummary = "1 hypothetical added";
    const dueDate = new Date("2026-12-01T00:00:00.000Z");
    mockOverrides = {
      toggledOffIds: new Set(),
      amountOverrides: new Map(),
      hypotheticals: [
        {
          id: "hyp1",
          name: "Holiday",
          type: "one_off",
          amount: 2000,
          frequency: null,
          frequencyDays: null,
          nextDueDate: dueDate,
          endDate: null,
          fundGroupId: null,
        },
      ],
    };

    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });

    render(<ScenarioBanner />);

    await user.click(screen.getByText("Apply"));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(mockResetAll).toHaveBeenCalledTimes(1);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/obligations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Holiday",
          type: "one_off",
          amount: 2000,
          frequency: null,
          frequencyDays: null,
          nextDueDate: dueDate.toISOString(),
          endDate: null,
          fundGroupId: null,
        }),
      })
    );

    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncomePage from "../page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockIncomeSources = [
  {
    id: "1",
    name: "Salary",
    expectedAmount: 5000,
    frequency: "monthly",
    frequencyDays: null,
    isIrregular: false,
    minimumExpected: null,
    nextExpectedDate: "2026-03-01T00:00:00.000Z",
    isPaused: false,
  },
  {
    id: "2",
    name: "Freelance",
    expectedAmount: 1500,
    frequency: "irregular",
    frequencyDays: null,
    isIrregular: true,
    minimumExpected: 500,
    nextExpectedDate: null,
    isPaused: true,
  },
];

describe("IncomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.confirm = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<IncomePage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the list of income sources", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockIncomeSources), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    expect(screen.getByText("Freelance")).toBeDefined();
    expect(screen.getByText(/\$5000\.00/)).toBeDefined();
    expect(screen.getByText(/Monthly/)).toBeDefined();
    expect(screen.getByText(/\$1500\.00/)).toBeDefined();
    expect(screen.getByText(/Irregular/)).toBeDefined();
  });

  it("shows the empty state when there are no income sources", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("No income sources yet")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Add your first income source to help calculate your contribution capacity."
      )
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Add your first income source" })
    ).toBeDefined();
  });

  it("navigates to the new income page when the add button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockIncomeSources), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Add income source" })
    );

    expect(mockPush).toHaveBeenCalledWith("/income/new");
  });

  it("navigates to the new income page from the empty state", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("No income sources yet")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Add your first income source" })
    );

    expect(mockPush).toHaveBeenCalledWith("/income/new");
  });

  it("navigates to the edit page when edit is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockIncomeSources), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);

    expect(mockPush).toHaveBeenCalledWith("/income/edit/1");
  });

  it("deletes an income source after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockIncomeSources), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Delete Salary" })
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete "Salary"?'
    );

    await waitFor(() => {
      expect(screen.queryByText("Salary")).toBeNull();
    });

    expect(screen.getByText("Freelance")).toBeDefined();
  });

  it("does not delete when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockIncomeSources), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Delete Salary" })
    );

    expect(screen.getByText("Salary")).toBeDefined();
  });

  it("shows paused badge for paused income sources", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockIncomeSources), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Paused")).toBeDefined();
    });
  });

  it("shows next expected date when available", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockIncomeSources), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText(/Next:/)).toBeDefined();
    });
  });

  it("shows an error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load income sources"
      );
    });
  });

  it("shows the page title", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    expect(
      screen.getByRole("heading", { name: "Income Sources" })
    ).toBeDefined();
  });

  it("toggles pause to resume when clicking pause button on active source", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockIncomeSources), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...mockIncomeSources[0], isPaused: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Pause Salary" })
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/income-sources/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaused: true }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Resume Salary" })
      ).toBeDefined();
    });
  });

  it("toggles resume to pause when clicking resume button on paused source", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockIncomeSources), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...mockIncomeSources[1], isPaused: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Freelance")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Resume Freelance" })
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/income-sources/2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaused: false }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Pause Freelance" })
      ).toBeDefined();
    });
  });

  it("shows error when toggle pause API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockIncomeSources), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText("Salary")).toBeDefined();
    });

    await user.click(
      screen.getByRole("button", { name: "Pause Salary" })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to update income source"
      );
    });
  });

  it("shows custom frequency with days", async () => {
    const customSource = [
      {
        id: "3",
        name: "Contract Work",
        expectedAmount: 3000,
        frequency: "custom",
        frequencyDays: 14,
        isIrregular: false,
        minimumExpected: null,
        nextExpectedDate: null,
        isPaused: false,
      },
    ];

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(customSource), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<IncomePage />);

    await waitFor(() => {
      expect(screen.getByText(/Every 14 days/)).toBeDefined();
    });
  });
});

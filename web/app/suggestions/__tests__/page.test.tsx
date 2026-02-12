import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuggestionsPage from "../page";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockSuggestions = [
  {
    id: "s1",
    type: "expense",
    vendorPattern: "Netflix",
    detectedAmount: 22.99,
    detectedAmountMin: null,
    detectedAmountMax: null,
    detectedFrequency: "monthly",
    confidence: "high",
    matchingTransactionCount: 6,
    status: "pending",
    suggestionTransactions: [],
  },
  {
    id: "s2",
    type: "income",
    vendorPattern: "Employer Inc",
    detectedAmount: 5000,
    detectedAmountMin: 4800,
    detectedAmountMax: 5200,
    detectedFrequency: "monthly",
    confidence: "medium",
    matchingTransactionCount: 3,
    status: "pending",
    suggestionTransactions: [],
  },
];

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SuggestionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<SuggestionsPage />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the list of suggestions", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
    );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    expect(screen.getByText("Employer Inc")).toBeDefined();
    expect(screen.getByText("$22.99")).toBeDefined();
    expect(screen.getByText("$4800.00 – $5200.00")).toBeDefined();
    expect(screen.getByText("Expense")).toBeDefined();
    expect(screen.getByText("Income")).toBeDefined();
    expect(screen.getByText("high confidence")).toBeDefined();
    expect(screen.getByText("medium confidence")).toBeDefined();
    expect(screen.getByText("6 transactions")).toBeDefined();
    expect(screen.getByText("3 transactions")).toBeDefined();
  });

  it("shows empty state when no suggestions exist", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("No new suggestions")).toBeDefined();
    });

    expect(
      screen.getByText(/No new patterns detected/)
    ).toBeDefined();
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: "internal server error" }, 500)
    );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load suggestions"
      );
    });
  });

  it("accepts a suggestion and removes it from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ suggestion: { ...mockSuggestions[0], status: "accepted" } })
      );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    await user.click(acceptButtons[0]);

    expect(global.fetch).toHaveBeenCalledWith("/api/suggestions/s1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });

    expect(screen.getByText("Employer Inc")).toBeDefined();
  });

  it("dismisses a suggestion and removes it from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ ...mockSuggestions[0], status: "dismissed" })
      );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    await user.click(dismissButtons[0]);

    expect(global.fetch).toHaveBeenCalledWith("/api/suggestions/s1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });
  });

  it("opens tweak form with pre-filled values", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
    );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const tweakButtons = screen.getAllByRole("button", { name: "Tweak" });
    await user.click(tweakButtons[0]);

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    const frequencySelect = screen.getByLabelText("Frequency") as HTMLSelectElement;

    expect(nameInput.value).toBe("Netflix");
    expect(amountInput.value).toBe("22.99");
    expect(frequencySelect.value).toBe("monthly");
  });

  it("saves tweaked suggestion with modified values", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ suggestion: { ...mockSuggestions[0], status: "accepted" } })
      );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const tweakButtons = screen.getAllByRole("button", { name: "Tweak" });
    await user.click(tweakButtons[0]);

    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "25.99");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/suggestions/s1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "accept",
        name: "Netflix",
        amount: 25.99,
        frequency: "monthly",
      }),
    });

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).toBeNull();
    });
  });

  it("cancels tweak form and shows action buttons again", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
    );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const tweakButtons = screen.getAllByRole("button", { name: "Tweak" });
    await user.click(tweakButtons[0]);

    expect(screen.getByLabelText("Name")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Name")).toBeNull();
    });

    expect(screen.getAllByRole("button", { name: "Tweak" })).toHaveLength(2);
  });

  it("shows the page title", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: [], count: 0 })
    );

    render(<SuggestionsPage />);

    expect(
      screen.getByRole("heading", { name: "Suggestions" })
    ).toBeDefined();
  });

  it("shows error when accept fails", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
      )
      .mockResolvedValueOnce(
        mockFetchResponse({ error: "internal server error" }, 500)
      );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
    });

    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    await user.click(acceptButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to accept suggestion"
      );
    });

    // Suggestion should still be in the list
    expect(screen.getByText("Netflix")).toBeDefined();
  });

  it("displays frequency labels correctly", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ suggestions: mockSuggestions, count: 2 })
    );

    render(<SuggestionsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Monthly")).toHaveLength(2);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockTransactions = [
  {
    id: "t1",
    date: "2026-02-01T00:00:00.000Z",
    description: "NETFLIX",
    amount: 22.99,
    type: "debit",
  },
  {
    id: "t2",
    date: "2026-01-28T00:00:00.000Z",
    description: "SALARY DEPOSIT",
    amount: 5000,
    type: "credit",
  },
  {
    id: "t3",
    date: "2026-01-15T00:00:00.000Z",
    description: "GROCERY STORE",
    amount: 85.42,
    type: "debit",
  },
];

const mockResponse = {
  transactions: mockTransactions,
  pagination: {
    page: 1,
    limit: 50,
    total: 3,
    totalPages: 1,
  },
};

const mockResponsePage1 = {
  transactions: mockTransactions.slice(0, 2),
  pagination: {
    page: 1,
    limit: 2,
    total: 3,
    totalPages: 2,
  },
};

const mockResponsePage2 = {
  transactions: mockTransactions.slice(2),
  pagination: {
    page: 2,
    limit: 2,
    total: 3,
    totalPages: 2,
  },
};

const mockEmptyResponse = {
  transactions: [],
  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  },
};

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<TransactionsPage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the page title", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<TransactionsPage />);

    expect(
      screen.getByRole("heading", { name: "Transactions" })
    ).toBeDefined();
  });

  it("renders the list of transactions", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    expect(screen.getByText("SALARY DEPOSIT")).toBeDefined();
    expect(screen.getByText("GROCERY STORE")).toBeDefined();
    expect(screen.getByText("-$22.99")).toBeDefined();
    expect(screen.getByText("+$5000.00")).toBeDefined();
    expect(screen.getByText("-$85.42")).toBeDefined();
  });

  it("shows the empty state when there are no transactions", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockEmptyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("No transactions found")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Import a bank statement to see your transactions here."
      )
    ).toBeDefined();
  });

  it("shows an error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load transactions"
      );
    });
  });

  it("renders date filter inputs and filter button", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<TransactionsPage />);

    expect(screen.getByLabelText("From")).toBeDefined();
    expect(screen.getByLabelText("To")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Filter" })
    ).toBeDefined();
  });

  it("applies date filter when filter button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEmptyResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");

    await user.clear(fromInput);
    await user.type(fromInput, "2026-03-01");
    await user.clear(toInput);
    await user.type(toInput, "2026-03-31");

    await user.click(screen.getByRole("button", { name: "Filter" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    const lastCall = vi.mocked(global.fetch).mock.calls[1];
    const url = lastCall[0] as string;
    expect(url).toContain("startDate=2026-03-01");
    expect(url).toContain("endDate=2026-03-31");
    expect(url).toContain("page=1");
  });

  it("shows clear button when filter is applied and clears on click", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEmptyResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    // No clear button before filtering
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

    const fromInput = screen.getByLabelText("From");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-03-01");
    await user.click(screen.getByRole("button", { name: "Filter" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Clear" })
      ).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    });
  });

  it("shows empty state with filter message when filter returns no results", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEmptyResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    const fromInput = screen.getByLabelText("From");
    await user.clear(fromInput);
    await user.type(fromInput, "2026-06-01");
    await user.click(screen.getByRole("button", { name: "Filter" }));

    await waitFor(() => {
      expect(screen.getByText("No transactions found")).toBeDefined();
    });

    expect(
      screen.getByText(
        "No transactions match your date filter. Try adjusting the range."
      )
    ).toBeDefined();
  });

  it("shows pagination controls when there are multiple pages", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponsePage1), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    expect(screen.getByText("Page 1 of 2")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Previous" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Next" })
    ).toBeDefined();

    // Previous should be disabled on page 1
    const prevButton = screen.getByRole("button", { name: "Previous" });
    expect(prevButton.hasAttribute("disabled")).toBe(true);

    // Next should be enabled
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton.hasAttribute("disabled")).toBe(false);
  });

  it("navigates to next page when clicking next", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponsePage1), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponsePage2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("GROCERY STORE")).toBeDefined();
    });

    expect(screen.getByText("Page 2 of 2")).toBeDefined();

    // Next should be disabled on last page
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton.hasAttribute("disabled")).toBe(true);
  });

  it("does not show pagination when there is only one page", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("NETFLIX")).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("shows credit transactions with a + prefix", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("+$5000.00")).toBeDefined();
    });
  });

  it("shows debit transactions with a - prefix", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("-$22.99")).toBeDefined();
    });
  });
});

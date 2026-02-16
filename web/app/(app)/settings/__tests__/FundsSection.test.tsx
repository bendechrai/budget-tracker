import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FundsSection from "../FundsSection";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockGroups = [
  { id: "1", name: "Essentials", isDefault: true, _count: { obligations: 3 } },
  { id: "2", name: "Savings", isDefault: false, _count: { obligations: 1 } },
  { id: "3", name: "Empty Fund", isDefault: false, _count: { obligations: 0 } },
];

function mockFetchGroups() {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(mockGroups), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("FundsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<FundsSection />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders fund groups after loading", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Essentials")).toBeDefined();
    });

    expect(screen.getByText("Savings")).toBeDefined();
    expect(screen.getByText("Empty Fund")).toBeDefined();
  });

  it("shows default badge on default group", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Default")).toBeDefined();
    });
  });

  it("shows obligation count for each group", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("3 obligations")).toBeDefined();
    });

    expect(screen.getByText("1 obligation")).toBeDefined();
    expect(screen.getByText("0 obligations")).toBeDefined();
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load fund groups")).toBeDefined();
    });
  });

  it("creates a new fund group", async () => {
    const user = userEvent.setup();
    mockFetchGroups();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "4", name: "Travel", isDefault: false, _count: { obligations: 0 } }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Essentials")).toBeDefined();
    });

    await user.type(screen.getByLabelText("New fund group name"), "Travel");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText("Travel")).toBeDefined();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/fund-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Travel" }),
    });
  });

  it("disables create button when name is empty", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Essentials")).toBeDefined();
    });

    const createButton = screen.getByRole("button", { name: "Create" });
    expect((createButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("renames a fund group via inline editing", async () => {
    const user = userEvent.setup();
    mockFetchGroups();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "2", name: "Investments", isDefault: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Savings")).toBeDefined();
    });

    // Click the Rename button for the Savings group (index 1: Essentials=0, Savings=1, Empty=2)
    const renameButtons = screen.getAllByRole("button", { name: "Rename" });
    await user.click(renameButtons[1]);

    const input = screen.getByLabelText("Fund group name");
    await user.clear(input);
    await user.type(input, "Investments");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Investments")).toBeDefined();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/fund-groups/2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Investments" }),
    });
  });

  it("cancels rename on Cancel button click", async () => {
    const user = userEvent.setup();
    mockFetchGroups();

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Savings")).toBeDefined();
    });

    const renameButtons = screen.getAllByRole("button", { name: "Rename" });
    await user.click(renameButtons[0]);

    const input = screen.getByLabelText("Fund group name");
    await user.clear(input);
    await user.type(input, "Something else");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Name should remain unchanged
    expect(screen.getByText("Savings")).toBeDefined();
    expect(screen.queryByText("Something else")).toBeNull();
  });

  it("cancels rename on Escape key", async () => {
    const user = userEvent.setup();
    mockFetchGroups();

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Savings")).toBeDefined();
    });

    const renameButtons = screen.getAllByRole("button", { name: "Rename" });
    await user.click(renameButtons[0]);

    const input = screen.getByLabelText("Fund group name");
    await user.type(input, "X");
    await user.keyboard("{Escape}");

    expect(screen.getByText("Savings")).toBeDefined();
  });

  it("disables delete button for default group", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Essentials")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    // The first delete button corresponds to the default group "Essentials"
    expect((deleteButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables delete button for groups with obligations", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Savings")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    // Savings has 1 obligation, so its delete button should be disabled
    expect((deleteButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables delete button for empty non-default groups", async () => {
    mockFetchGroups();
    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Empty Fund")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    // Empty Fund has 0 obligations and is not default
    expect((deleteButtons[2] as HTMLButtonElement).disabled).toBe(false);
  });

  it("deletes a fund group after confirmation", async () => {
    const user = userEvent.setup();
    mockFetchGroups();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Empty Fund")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[2]); // Empty Fund

    // ConfirmDialog should appear
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByTestId("confirm-dialog-message").textContent).toBe(
      'Are you sure you want to delete "Empty Fund"?'
    );

    await user.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => {
      expect(screen.queryByText("Empty Fund")).toBeNull();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/fund-groups/3", {
      method: "DELETE",
    });
  });

  it("does not delete when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    mockFetchGroups();

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Empty Fund")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[2]);

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    await user.click(screen.getByTestId("confirm-dialog-cancel"));

    // Fund group should still be there
    expect(screen.getByText("Empty Fund")).toBeDefined();
  });

  it("shows contribution history when History button is clicked", async () => {
    const user = userEvent.setup();
    mockFetchGroups();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Essentials")).toBeDefined();
    });

    expect(screen.queryByTestId("contribution-history")).toBeNull();

    const historyButtons = screen.getAllByRole("button", { name: "History" });
    await user.click(historyButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history")).toBeDefined();
    });
  });

  it("hides contribution history when History button is clicked again", async () => {
    const user = userEvent.setup();
    mockFetchGroups();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Essentials")).toBeDefined();
    });

    const historyButtons = screen.getAllByRole("button", { name: "History" });
    await user.click(historyButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("contribution-history")).toBeDefined();
    });

    await user.click(historyButtons[0]);

    await waitFor(() => {
      expect(screen.queryByTestId("contribution-history")).toBeNull();
    });
  });

  it("shows API error on delete failure", async () => {
    const user = userEvent.setup();
    mockFetchGroups();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Cannot delete default fund group" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<FundsSection />);

    await waitFor(() => {
      expect(screen.getByText("Empty Fund")).toBeDefined();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[2]);

    await user.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => {
      expect(screen.getByText("Cannot delete default fund group")).toBeDefined();
    });
  });
});

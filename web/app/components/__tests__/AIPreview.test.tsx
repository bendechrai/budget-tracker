import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIPreview from "../AIPreview";
import type { CreateIntent, EditIntent, DeleteIntent } from "@/lib/ai/types";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const createIncomeIntent: CreateIntent = {
  type: "create",
  targetType: "income",
  confidence: "high",
  incomeFields: {
    name: "Salary",
    expectedAmount: 3200,
    frequency: "monthly",
  },
};

const createObligationIntent: CreateIntent = {
  type: "create",
  targetType: "expense",
  confidence: "high",
  obligationFields: {
    name: "Netflix",
    type: "recurring",
    amount: 22.99,
    frequency: "monthly",
    nextDueDate: "2026-03-01",
  },
};

const editIntent: EditIntent = {
  type: "edit",
  targetType: "expense",
  targetName: "Netflix",
  confidence: "high",
  changes: { amount: 30 },
};

const deleteIntent: DeleteIntent = {
  type: "delete",
  targetType: "expense",
  targetName: "Netflix",
  confidence: "high",
};

describe("AIPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Create Preview", () => {
    it("renders income source create preview", () => {
      render(<AIPreview intent={createIncomeIntent} />);

      expect(screen.getByTestId("ai-preview-modal")).toBeDefined();
      expect(screen.getByTestId("ai-preview-create")).toBeDefined();
      expect(screen.getByTestId("preview-field-name").textContent).toBe("Salary");
      expect(screen.getByTestId("preview-field-amount").textContent).toBe("$3200.00");
      expect(screen.getByTestId("preview-field-frequency").textContent).toBe("monthly");
    });

    it("renders obligation create preview", () => {
      render(<AIPreview intent={createObligationIntent} />);

      expect(screen.getByTestId("ai-preview-create")).toBeDefined();
      expect(screen.getByTestId("preview-field-name").textContent).toBe("Netflix");
      expect(screen.getByTestId("preview-field-amount").textContent).toBe("$22.99");
      expect(screen.getByTestId("preview-field-type").textContent).toBe("recurring");
    });

    it("executes create income on confirm", async () => {
      const user = userEvent.setup();
      const onDone = vi.fn();

      // Mock POST /api/income-sources
      vi.mocked(global.fetch).mockImplementation(async (url) => {
        if (url === "/api/income-sources") {
          return mockFetchResponse({ id: "inc-1", name: "Salary" }, 201);
        }
        if (url === "/api/engine/recalculate") {
          return mockFetchResponse({ id: "snap-1" });
        }
        return mockFetchResponse({}, 404);
      });

      render(<AIPreview intent={createIncomeIntent} onDone={onDone} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-success")).toBeDefined();
        expect(screen.getByTestId("ai-preview-success").textContent).toContain("Created income source");
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/income-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      });
      expect(onDone).toHaveBeenCalled();
    });

    it("executes create obligation on confirm", async () => {
      const user = userEvent.setup();
      const onDone = vi.fn();

      vi.mocked(global.fetch).mockImplementation(async (url) => {
        if (url === "/api/obligations") {
          return mockFetchResponse({ id: "ob-1", name: "Netflix" }, 201);
        }
        if (url === "/api/engine/recalculate") {
          return mockFetchResponse({ id: "snap-1" });
        }
        return mockFetchResponse({}, 404);
      });

      render(<AIPreview intent={createObligationIntent} onDone={onDone} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-success")).toBeDefined();
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      });
      expect(onDone).toHaveBeenCalled();
    });
  });

  describe("Edit Preview", () => {
    it("renders edit diff view", () => {
      render(<AIPreview intent={editIntent} />);

      expect(screen.getByTestId("ai-preview-edit")).toBeDefined();
      expect(screen.getByTestId("preview-change-amount").textContent).toBe("$30.00");
    });

    it("executes edit on confirm", async () => {
      const user = userEvent.setup();
      const onDone = vi.fn();

      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        const opts = options as RequestInit | undefined;
        if (url === "/api/obligations" && (!opts || opts.method !== "PUT")) {
          return mockFetchResponse([
            { id: "ob-1", name: "Netflix" },
            { id: "ob-2", name: "Spotify" },
          ]);
        }
        if (url === "/api/obligations/ob-1" && opts?.method === "PUT") {
          return mockFetchResponse({ id: "ob-1", name: "Netflix", amount: 30 });
        }
        if (url === "/api/engine/recalculate") {
          return mockFetchResponse({ id: "snap-1" });
        }
        return mockFetchResponse({}, 404);
      });

      render(<AIPreview intent={editIntent} onDone={onDone} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-success")).toBeDefined();
        expect(screen.getByTestId("ai-preview-success").textContent).toContain("Updated");
      });

      expect(onDone).toHaveBeenCalled();
    });

    it("shows error when item not found for edit", async () => {
      const user = userEvent.setup();

      vi.mocked(global.fetch).mockImplementation(async (url) => {
        if (url === "/api/obligations") {
          return mockFetchResponse([{ id: "ob-2", name: "Spotify" }]);
        }
        return mockFetchResponse({}, 404);
      });

      render(<AIPreview intent={editIntent} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-error")).toBeDefined();
        expect(screen.getByTestId("ai-preview-error").textContent).toContain("Could not find");
      });
    });
  });

  describe("Delete Preview", () => {
    it("renders delete confirmation", () => {
      render(<AIPreview intent={deleteIntent} />);

      expect(screen.getByTestId("ai-preview-delete")).toBeDefined();
      const deleteSection = screen.getByTestId("ai-preview-delete");
      expect(deleteSection.textContent).toContain("Netflix");
      expect(deleteSection.textContent).toContain("obligation");
    });

    it("uses red confirm button for delete", () => {
      render(<AIPreview intent={deleteIntent} />);

      const confirmBtn = screen.getByTestId("ai-preview-confirm");
      expect(confirmBtn.textContent).toBe("Delete");
    });

    it("executes delete on confirm", async () => {
      const user = userEvent.setup();
      const onDone = vi.fn();

      vi.mocked(global.fetch).mockImplementation(async (url, options) => {
        const opts = options as RequestInit | undefined;
        if (url === "/api/obligations" && (!opts || !opts.method || opts.method === "GET")) {
          return mockFetchResponse([{ id: "ob-1", name: "Netflix" }]);
        }
        if (url === "/api/obligations/ob-1" && opts?.method === "DELETE") {
          return mockFetchResponse({ success: true });
        }
        if (url === "/api/engine/recalculate") {
          return mockFetchResponse({ id: "snap-1" });
        }
        return mockFetchResponse({}, 404);
      });

      render(<AIPreview intent={deleteIntent} onDone={onDone} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-success")).toBeDefined();
        expect(screen.getByTestId("ai-preview-success").textContent).toContain("Deleted");
      });

      expect(onDone).toHaveBeenCalled();
    });
  });

  describe("Cancel/Close", () => {
    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(<AIPreview intent={createIncomeIntent} onCancel={onCancel} />);

      await user.click(screen.getByTestId("ai-preview-cancel"));

      expect(onCancel).toHaveBeenCalled();
    });

    it("calls onCancel when close button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(<AIPreview intent={createIncomeIntent} onCancel={onCancel} />);

      await user.click(screen.getByTestId("ai-preview-close"));

      expect(onCancel).toHaveBeenCalled();
    });

    it("hides action buttons after successful action", async () => {
      const user = userEvent.setup();

      vi.mocked(global.fetch).mockImplementation(async (url) => {
        if (url === "/api/income-sources") {
          return mockFetchResponse({ id: "inc-1", name: "Salary" }, 201);
        }
        if (url === "/api/engine/recalculate") {
          return mockFetchResponse({ id: "snap-1" });
        }
        return mockFetchResponse({}, 404);
      });

      render(<AIPreview intent={createIncomeIntent} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-success")).toBeDefined();
      });

      expect(screen.queryByTestId("ai-preview-confirm")).toBeNull();
      expect(screen.queryByTestId("ai-preview-cancel")).toBeNull();
    });
  });

  describe("Error handling", () => {
    it("shows error when API returns error", async () => {
      const user = userEvent.setup();

      vi.mocked(global.fetch).mockImplementation(async () => {
        return mockFetchResponse({ error: "name is required" }, 400);
      });

      render(<AIPreview intent={createIncomeIntent} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-error")).toBeDefined();
        expect(screen.getByTestId("ai-preview-error").textContent).toBe("name is required");
      });
    });

    it("shows error on network failure", async () => {
      const user = userEvent.setup();

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      render(<AIPreview intent={createIncomeIntent} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("ai-preview-error")).toBeDefined();
        expect(screen.getByTestId("ai-preview-error").textContent).toBe("Network error");
      });
    });

    it("disables buttons while loading", async () => {
      const user = userEvent.setup();

      // Create a promise that we control to keep loading state active
      let resolvePromise: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(global.fetch).mockReturnValueOnce(pendingPromise);

      render(<AIPreview intent={createIncomeIntent} />);

      await user.click(screen.getByTestId("ai-preview-confirm"));

      const confirmBtn = screen.getByTestId("ai-preview-confirm");
      expect(confirmBtn.hasAttribute("disabled")).toBe(true);
      expect(confirmBtn.textContent).toBe("Processing...");

      const cancelBtn = screen.getByTestId("ai-preview-cancel");
      expect(cancelBtn.hasAttribute("disabled")).toBe(true);

      // Clean up
      resolvePromise!(mockFetchResponse({ id: "inc-1" }, 201));
    });
  });

  describe("Accessibility", () => {
    it("has accessible dialog role", () => {
      render(<AIPreview intent={createIncomeIntent} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
    });

    it("has close button with accessible label", () => {
      render(<AIPreview intent={createIncomeIntent} />);

      expect(screen.getByLabelText("Close preview")).toBeDefined();
    });
  });
});

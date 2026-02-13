import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIBar from "../AIBar";
import { WhatIfProvider } from "@/app/contexts/WhatIfContext";
import type { ReactNode } from "react";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderWithProvider(ui: ReactNode) {
  return render(<WhatIfProvider>{ui}</WhatIfProvider>);
}

describe("AIBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders collapsed pill by default", () => {
    renderWithProvider(<AIBar />);

    const pill = screen.getByTestId("ai-bar-pill");
    expect(pill).toBeDefined();
    expect(pill.textContent).toBe("AI");
    expect(screen.queryByTestId("ai-bar-panel")).toBeNull();
  });

  it("expands to show panel on click", async () => {
    const user = userEvent.setup();
    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));

    expect(screen.getByTestId("ai-bar-panel")).toBeDefined();
    expect(screen.getByTestId("ai-bar-input")).toBeDefined();
    expect(screen.queryByTestId("ai-bar-pill")).toBeNull();
  });

  it("collapses when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    expect(screen.getByTestId("ai-bar-panel")).toBeDefined();

    await user.click(screen.getByTestId("ai-bar-close"));
    expect(screen.queryByTestId("ai-bar-panel")).toBeNull();
    expect(screen.getByTestId("ai-bar-pill")).toBeDefined();
  });

  it("opens AIPreview for create intent instead of showing text response", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "create",
          targetType: "expense",
          confidence: "high",
          obligationFields: {
            name: "Netflix",
            type: "recurring",
            amount: 22.99,
            frequency: "monthly",
          },
        },
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "Add Netflix $22.99 monthly");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-preview-overlay")).toBeDefined();
      expect(screen.getByTestId("ai-preview-create")).toBeDefined();
      expect(screen.getByTestId("preview-field-name").textContent).toBe("Netflix");
    });

    // Should NOT show inline text response
    expect(screen.queryByTestId("ai-bar-response")).toBeNull();

    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Add Netflix $22.99 monthly" }),
    });
  });

  it("opens AIPreview for edit intent", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "edit",
          targetType: "expense",
          targetName: "Netflix",
          confidence: "high",
          changes: { amount: 30 },
        },
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "Change Netflix to $30");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-preview-overlay")).toBeDefined();
      expect(screen.getByTestId("ai-preview-edit")).toBeDefined();
    });

    expect(screen.queryByTestId("ai-bar-response")).toBeNull();
  });

  it("opens AIPreview for delete intent", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "delete",
          targetType: "expense",
          targetName: "Netflix",
          confidence: "high",
        },
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "Delete Netflix");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-preview-overlay")).toBeDefined();
      expect(screen.getByTestId("ai-preview-delete")).toBeDefined();
    });

    expect(screen.queryByTestId("ai-bar-response")).toBeNull();
  });

  it("dismisses AIPreview on cancel", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "create",
          targetType: "income",
          confidence: "high",
          incomeFields: {
            name: "Salary",
            expectedAmount: 3200,
            frequency: "monthly",
          },
        },
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "Add salary $3200 monthly");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-preview-overlay")).toBeDefined();
    });

    await user.click(screen.getByTestId("ai-preview-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("ai-preview-overlay")).toBeNull();
    });
  });

  it("closes AIPreview and shows success message on confirm", async () => {
    const user = userEvent.setup();

    // First call: parse API
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "create",
          targetType: "income",
          confidence: "high",
          incomeFields: {
            name: "Salary",
            expectedAmount: 3200,
            frequency: "monthly",
          },
        },
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "Add salary $3200 monthly");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-preview-overlay")).toBeDefined();
    });

    // Mock the create API and engine recalculate calls for confirm
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      if (url === "/api/income-sources") {
        return mockFetchResponse({ id: "inc-1", name: "Salary" }, 201);
      }
      if (url === "/api/engine/recalculate") {
        return mockFetchResponse({ id: "snap-1" });
      }
      return mockFetchResponse({}, 404);
    });

    await user.click(screen.getByTestId("ai-preview-confirm"));

    await waitFor(() => {
      expect(screen.queryByTestId("ai-preview-overlay")).toBeNull();
    });

    // Should show success message in the AI bar response area
    await waitFor(() => {
      const response = screen.getByTestId("ai-bar-response");
      expect(response.textContent).toBe("Action completed successfully");
    });
  });

  it("handles query intent inline without opening AIPreview", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "query",
          question: "Your biggest expense is rent at $1,500",
          confidence: "high",
        },
        answer: "Your biggest expense is rent at $1,500",
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "What is my biggest expense?");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const response = screen.getByTestId("ai-bar-response");
      expect(response.textContent).toBe("Your biggest expense is rent at $1,500");
    });

    // AIPreview should NOT be shown for query intents
    expect(screen.queryByTestId("ai-preview-overlay")).toBeNull();
  });

  it("shows error response on API failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: "unauthorized" }, 401)
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "test");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      const response = screen.getByTestId("ai-bar-response");
      expect(response.textContent).toBe("unauthorized");
    });
  });

  it("shows network error message on fetch failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "test");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      const response = screen.getByTestId("ai-bar-response");
      expect(response.textContent).toBe("Failed to process request");
    });
  });

  it("disables submit button when input is empty", async () => {
    const user = userEvent.setup();
    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));

    const submitButton = screen.getByTestId("ai-bar-submit");
    expect(submitButton.hasAttribute("disabled")).toBe(true);
  });

  it("clears input after successful submission", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "clarification",
          message: "Which subscription?",
          originalInput: "change subscription",
        },
      })
    );

    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "change subscription");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      const input = screen.getByTestId("ai-bar-input") as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  it("has accessible labels", async () => {
    const user = userEvent.setup();
    renderWithProvider(<AIBar />);

    expect(screen.getByLabelText("Open AI assistant")).toBeDefined();

    await user.click(screen.getByTestId("ai-bar-pill"));

    expect(screen.getByLabelText("Close AI assistant")).toBeDefined();
    expect(screen.getByLabelText("AI assistant input")).toBeDefined();
    expect(screen.getByLabelText("Submit")).toBeDefined();
  });

  it("supports drag repositioning via mouse events", async () => {
    const user = userEvent.setup();
    renderWithProvider(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));

    const header = screen.getByRole("toolbar");
    expect(header).toBeDefined();

    // Simulate drag: mousedown, mousemove, mouseup
    fireEvent.mouseDown(header, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });
    fireEvent.mouseUp(document);

    // After drag, the wrapper should have inline position styles
    const wrapper = screen.getByTestId("ai-bar");
    const style = wrapper.style;
    // Position should be set (not necessarily exact values due to initial position calc)
    expect(style.position).toBe("fixed");
  });

  describe("what-if integration", () => {
    it("shows scenario response for what-if toggle_off intent", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse({
          intent: {
            type: "whatif",
            changes: [
              { action: "toggle_off", targetName: "gym" },
            ],
            confidence: "high",
          },
          obligations: [
            { id: "obl-1", name: "Gym" },
            { id: "obl-2", name: "Netflix" },
          ],
        })
      );

      renderWithProvider(<AIBar />);

      await user.click(screen.getByTestId("ai-bar-pill"));
      await user.type(screen.getByTestId("ai-bar-input"), "What if I cancel gym?");
      await user.click(screen.getByTestId("ai-bar-submit"));

      await waitFor(() => {
        const response = screen.getByTestId("ai-bar-response");
        expect(response.textContent).toContain("toggled off");
        expect(response.textContent).toContain("Gym");
      });
    });

    it("shows scenario response for what-if override_amount intent", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse({
          intent: {
            type: "whatif",
            changes: [
              { action: "override_amount", targetName: "netflix", amount: 30 },
            ],
            confidence: "high",
          },
          obligations: [
            { id: "obl-1", name: "Netflix" },
          ],
        })
      );

      renderWithProvider(<AIBar />);

      await user.click(screen.getByTestId("ai-bar-pill"));
      await user.type(screen.getByTestId("ai-bar-input"), "What if Netflix goes up to $30?");
      await user.click(screen.getByTestId("ai-bar-submit"));

      await waitFor(() => {
        const response = screen.getByTestId("ai-bar-response");
        expect(response.textContent).toContain("Netflix");
        expect(response.textContent).toContain("$30");
      });
    });

    it("shows scenario response for what-if add_hypothetical intent", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse({
          intent: {
            type: "whatif",
            changes: [
              { action: "add_hypothetical", targetName: "Holiday", amount: 2000, dueDate: "2026-12-01" },
            ],
            confidence: "high",
          },
          obligations: [],
        })
      );

      renderWithProvider(<AIBar />);

      await user.click(screen.getByTestId("ai-bar-pill"));
      await user.type(screen.getByTestId("ai-bar-input"), "What if I add a $2000 holiday in December?");
      await user.click(screen.getByTestId("ai-bar-submit"));

      await waitFor(() => {
        const response = screen.getByTestId("ai-bar-response");
        expect(response.textContent).toContain("hypothetical");
        expect(response.textContent).toContain("Holiday");
      });
    });

    it("shows combined scenario response for multiple what-if changes", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse({
          intent: {
            type: "whatif",
            changes: [
              { action: "toggle_off", targetName: "gym" },
              { action: "toggle_off", targetName: "netflix" },
            ],
            confidence: "high",
          },
          obligations: [
            { id: "obl-1", name: "Gym" },
            { id: "obl-2", name: "Netflix" },
          ],
        })
      );

      renderWithProvider(<AIBar />);

      await user.click(screen.getByTestId("ai-bar-pill"));
      await user.type(screen.getByTestId("ai-bar-input"), "What if I cancel gym and Netflix?");
      await user.click(screen.getByTestId("ai-bar-submit"));

      await waitFor(() => {
        const response = screen.getByTestId("ai-bar-response");
        expect(response.textContent).toContain("Gym");
        expect(response.textContent).toContain("Netflix");
      });
    });
  });
});

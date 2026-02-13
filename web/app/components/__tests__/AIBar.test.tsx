import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIBar from "../AIBar";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    render(<AIBar />);

    const pill = screen.getByTestId("ai-bar-pill");
    expect(pill).toBeDefined();
    expect(pill.textContent).toBe("AI");
    expect(screen.queryByTestId("ai-bar-panel")).toBeNull();
  });

  it("expands to show panel on click", async () => {
    const user = userEvent.setup();
    render(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));

    expect(screen.getByTestId("ai-bar-panel")).toBeDefined();
    expect(screen.getByTestId("ai-bar-input")).toBeDefined();
    expect(screen.queryByTestId("ai-bar-pill")).toBeNull();
  });

  it("collapses when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    expect(screen.getByTestId("ai-bar-panel")).toBeDefined();

    await user.click(screen.getByTestId("ai-bar-close"));
    expect(screen.queryByTestId("ai-bar-panel")).toBeNull();
    expect(screen.getByTestId("ai-bar-pill")).toBeDefined();
  });

  it("submits input to parse API and shows response", async () => {
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

    render(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "Add Netflix $22.99 monthly");
    await user.click(screen.getByTestId("ai-bar-submit"));

    await waitFor(() => {
      const response = screen.getByTestId("ai-bar-response");
      expect(response.textContent).toBe('Parsed: Create obligation "Netflix"');
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Add Netflix $22.99 monthly" }),
    });
  });

  it("submits input on Enter key", async () => {
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

    render(<AIBar />);

    await user.click(screen.getByTestId("ai-bar-pill"));
    await user.type(screen.getByTestId("ai-bar-input"), "What is my biggest expense?");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const response = screen.getByTestId("ai-bar-response");
      expect(response.textContent).toBe("Your biggest expense is rent at $1,500");
    });
  });

  it("shows error response on API failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: "unauthorized" }, 401)
    );

    render(<AIBar />);

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

    render(<AIBar />);

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
    render(<AIBar />);

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

    render(<AIBar />);

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
    render(<AIBar />);

    expect(screen.getByLabelText("Open AI assistant")).toBeDefined();

    await user.click(screen.getByTestId("ai-bar-pill"));

    expect(screen.getByLabelText("Close AI assistant")).toBeDefined();
    expect(screen.getByLabelText("AI assistant input")).toBeDefined();
    expect(screen.getByLabelText("Submit")).toBeDefined();
  });

  it("supports drag repositioning via mouse events", async () => {
    const user = userEvent.setup();
    render(<AIBar />);

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
});

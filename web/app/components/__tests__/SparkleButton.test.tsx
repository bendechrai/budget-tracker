import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SparkleButton from "../SparkleButton";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

vi.mock("@/app/components/AIPreview", () => ({
  default: ({ intent, onDone, onCancel }: {
    intent: { type: string; targetName?: string };
    onDone: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="mock-ai-preview">
      <span data-testid="ai-preview-intent-type">{intent.type}</span>
      <span data-testid="ai-preview-target-name">{intent.targetName ?? ""}</span>
      <button data-testid="ai-preview-done" onClick={onDone}>Done</button>
      <button data-testid="ai-preview-cancel" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock("@/app/(app)/obligations/EscalationForm", () => ({
  default: ({ obligationId, obligationName, onSaved, onCancel }: {
    obligationId: string;
    obligationName: string;
    onSaved: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="mock-escalation-form">
      <span data-testid="escalation-form-obligation-id">{obligationId}</span>
      <span data-testid="escalation-form-obligation-name">{obligationName}</span>
      <button data-testid="escalation-form-save" onClick={onSaved}>Save</button>
      <button data-testid="escalation-form-cancel" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

function mockFetchResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const incomeItem = {
  id: "inc-1",
  name: "Salary",
  amount: 3200,
  frequency: "monthly",
  type: "income" as const,
};

const obligationItem = {
  id: "ob-1",
  name: "Netflix",
  amount: 22.99,
  frequency: "monthly",
  type: "obligation" as const,
};

describe("SparkleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders sparkle button", () => {
    render(<SparkleButton item={incomeItem} />);
    const button = screen.getByTestId("sparkle-button-inc-1");
    expect(button).toBeDefined();
    expect(button.textContent).toContain("✨");
  });

  it("opens modal on click", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));

    expect(screen.getByTestId("sparkle-modal-inc-1")).toBeDefined();
    expect(screen.getByTestId("sparkle-summary")).toBeDefined();
    expect(screen.getByTestId("sparkle-presets")).toBeDefined();
    expect(screen.getByTestId("sparkle-free-text")).toBeDefined();
  });

  it("shows item summary in modal", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));

    const summary = screen.getByTestId("sparkle-summary");
    expect(summary.textContent).toContain("Salary");
    expect(summary.textContent).toContain("3200.00");
    expect(summary.textContent).toContain("monthly");
  });

  it("shows income presets for income items", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));

    expect(screen.getByTestId("sparkle-preset-amount")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-frequency")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-pause")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-delete")).toBeDefined();
    expect(screen.queryByTestId("sparkle-preset-dueDate")).toBeNull();
  });

  it("shows obligation presets including due date and escalation for obligation items", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));

    expect(screen.getByTestId("sparkle-preset-amount")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-escalation")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-frequency")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-dueDate")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-pause")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-delete")).toBeDefined();
  });

  it("opens AIPreview with delete intent when Delete preset is clicked", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-delete"));

    expect(screen.getByTestId("mock-ai-preview")).toBeDefined();
    expect(screen.getByTestId("ai-preview-intent-type").textContent).toBe("delete");
    expect(screen.getByTestId("ai-preview-target-name").textContent).toBe("Netflix");
  });

  it("opens AIPreview with pause intent when Pause preset is clicked", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));
    await user.click(screen.getByTestId("sparkle-preset-pause"));

    expect(screen.getByTestId("mock-ai-preview")).toBeDefined();
    expect(screen.getByTestId("ai-preview-intent-type").textContent).toBe("edit");
    expect(screen.getByTestId("ai-preview-target-name").textContent).toBe("Salary");
  });

  it("opens AIPreview with edit intent when Change amount preset is clicked", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-amount"));

    expect(screen.getByTestId("mock-ai-preview")).toBeDefined();
    expect(screen.getByTestId("ai-preview-intent-type").textContent).toBe("edit");
    expect(screen.getByTestId("ai-preview-target-name").textContent).toBe("Netflix");
  });

  it("submits free text through NL parser API and opens AIPreview", async () => {
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

    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.type(screen.getByTestId("sparkle-free-text"), "change to $30");
    await user.click(screen.getByTestId("sparkle-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("mock-ai-preview")).toBeDefined();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "change to $30 for Netflix" }),
    });

    expect(screen.getByTestId("ai-preview-intent-type").textContent).toBe("edit");
    expect(screen.getByTestId("ai-preview-target-name").textContent).toBe("Netflix");
  });

  it("submits free text on Enter key and opens AIPreview", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({
        intent: {
          type: "edit",
          targetType: "income",
          targetName: "Salary",
          confidence: "high",
          changes: { amount: 3500 },
        },
      })
    );

    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));
    await user.type(screen.getByTestId("sparkle-free-text"), "increase to $3500");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("mock-ai-preview")).toBeDefined();
    });
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: "unauthorized" }, 401)
    );

    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));
    await user.type(screen.getByTestId("sparkle-free-text"), "test");
    await user.click(screen.getByTestId("sparkle-submit"));

    await waitFor(() => {
      const response = screen.getByTestId("sparkle-response");
      expect(response.textContent).toBe("unauthorized");
    });
  });

  it("shows error on network failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));
    await user.type(screen.getByTestId("sparkle-free-text"), "test");
    await user.click(screen.getByTestId("sparkle-submit"));

    await waitFor(() => {
      const response = screen.getByTestId("sparkle-response");
      expect(response.textContent).toBe("Failed to process request");
    });
  });

  it("closes modal on close button click", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));
    expect(screen.getByTestId("sparkle-modal-inc-1")).toBeDefined();

    await user.click(screen.getByTestId("sparkle-close"));
    expect(screen.queryByTestId("sparkle-modal-inc-1")).toBeNull();
  });

  it("disables submit button when free text is empty", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    await user.click(screen.getByTestId("sparkle-button-inc-1"));

    const submitButton = screen.getByTestId("sparkle-submit");
    expect(submitButton.hasAttribute("disabled")).toBe(true);
  });

  it("has accessible labels", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={incomeItem} />);

    expect(screen.getByLabelText("AI actions for Salary")).toBeDefined();

    await user.click(screen.getByTestId("sparkle-button-inc-1"));

    expect(screen.getByLabelText("Close")).toBeDefined();
    expect(screen.getByLabelText("Free text input")).toBeDefined();
    expect(screen.getByLabelText("Submit")).toBeDefined();
  });

  it("opens AIPreview for preset actions instead of showing response text", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-delete"));

    expect(screen.getByTestId("mock-ai-preview")).toBeDefined();
    expect(screen.queryByTestId("sparkle-response")).toBeNull();
  });

  it("opens escalation form when 'Add price change' preset is clicked", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-escalation"));

    expect(screen.getByTestId("sparkle-escalation-form")).toBeDefined();
    expect(screen.getByTestId("mock-escalation-form")).toBeDefined();
    expect(screen.getByTestId("escalation-form-obligation-id")?.textContent).toBe("ob-1");
    expect(screen.getByTestId("escalation-form-obligation-name")?.textContent).toBe("Netflix");
  });

  it("hides 'Add price change' preset for one-off obligations", async () => {
    const user = userEvent.setup();
    const oneOffItem = {
      ...obligationItem,
      id: "ob-2",
      obligationType: "one_off",
    };
    render(<SparkleButton item={oneOffItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-2"));

    expect(screen.queryByTestId("sparkle-preset-escalation")).toBeNull();
    expect(screen.getByTestId("sparkle-preset-amount")).toBeDefined();
    expect(screen.getByTestId("sparkle-preset-delete")).toBeDefined();
  });

  it("returns to presets when back button is clicked from escalation form", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-escalation"));

    expect(screen.getByTestId("sparkle-escalation-form")).toBeDefined();

    await user.click(screen.getByTestId("sparkle-close"));

    expect(screen.queryByTestId("sparkle-escalation-form")).toBeNull();
    expect(screen.getByTestId("sparkle-presets")).toBeDefined();
  });

  it("calls onAction and closes modal when escalation form is saved", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<SparkleButton item={obligationItem} onAction={onAction} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-escalation"));
    await user.click(screen.getByTestId("escalation-form-save"));

    expect(onAction).toHaveBeenCalledWith({
      type: "edit",
      targetType: "expense",
      targetName: "Netflix",
      confidence: "high",
      changes: {},
    });
    expect(screen.queryByTestId("sparkle-modal-ob-1")).toBeNull();
  });

  it("returns to presets when escalation form cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<SparkleButton item={obligationItem} />);

    await user.click(screen.getByTestId("sparkle-button-ob-1"));
    await user.click(screen.getByTestId("sparkle-preset-escalation"));

    expect(screen.getByTestId("sparkle-escalation-form")).toBeDefined();

    await user.click(screen.getByTestId("escalation-form-cancel"));

    expect(screen.queryByTestId("sparkle-escalation-form")).toBeNull();
    expect(screen.getByTestId("sparkle-presets")).toBeDefined();
  });
});

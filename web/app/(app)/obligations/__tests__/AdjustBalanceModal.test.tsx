import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdjustBalanceModal from "../AdjustBalanceModal";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const defaultProps = {
  fundGroupId: "fg-1",
  fundGroupName: "Netflix",
  currentBalance: 50,
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

describe("AdjustBalanceModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with current balance pre-filled", () => {
    render(<AdjustBalanceModal {...defaultProps} />);

    expect(screen.getByTestId("adjust-balance-modal")).toBeDefined();
    expect(screen.getByTestId("adjust-balance-modal-name").textContent).toBe("Netflix");
    expect(screen.getByTestId("adjust-balance-modal-current").textContent).toBe("$50.00");

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    expect(balanceInput.value).toBe("50.00");
  });

  it("accepts new balance input", async () => {
    const user = userEvent.setup();
    render(<AdjustBalanceModal {...defaultProps} />);

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    await user.clear(balanceInput);
    await user.type(balanceInput, "75.50");

    expect(parseFloat(balanceInput.value)).toBe(75.5);
  });

  it("submits adjustment successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ fundGroupId: "fg-1", currentBalance: 75.5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AdjustBalanceModal {...defaultProps} />);

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    await user.clear(balanceInput);
    await user.type(balanceInput, "75.50");

    await user.click(screen.getByTestId("adjust-balance-modal-save"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/fund-groups/fg-1/balance",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ balance: 75.5 }),
        })
      );
    });

    expect(defaultProps.onSaved).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "budget-data-changed" })
    );
  });

  it("supports decreasing balance", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ fundGroupId: "fg-1", currentBalance: 20 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AdjustBalanceModal {...defaultProps} />);

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    await user.clear(balanceInput);
    await user.type(balanceInput, "20");

    await user.click(screen.getByTestId("adjust-balance-modal-save"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/fund-groups/fg-1/balance",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ balance: 20 }),
        })
      );
    });

    expect(defaultProps.onSaved).toHaveBeenCalled();
  });

  it("validates negative balance", async () => {
    const user = userEvent.setup();
    render(<AdjustBalanceModal {...defaultProps} />);

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    await user.clear(balanceInput);
    await user.type(balanceInput, "-5");

    await user.click(screen.getByTestId("adjust-balance-modal-save"));

    expect(screen.getByTestId("adjust-balance-modal-validation-error").textContent).toBe(
      "Balance cannot be negative"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("validates non-numeric input", async () => {
    const user = userEvent.setup();
    render(<AdjustBalanceModal {...defaultProps} />);

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    await user.clear(balanceInput);

    await user.click(screen.getByTestId("adjust-balance-modal-save"));

    expect(screen.getByTestId("adjust-balance-modal-validation-error").textContent).toBe(
      "Please enter a valid number"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AdjustBalanceModal {...defaultProps} />);

    await user.click(screen.getByTestId("adjust-balance-modal-save"));

    await waitFor(() => {
      expect(screen.getByTestId("adjust-balance-modal-error")).toBeDefined();
    });
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<AdjustBalanceModal {...defaultProps} />);

    await user.click(screen.getByTestId("adjust-balance-modal-cancel"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<AdjustBalanceModal {...defaultProps} />);

    await user.click(screen.getByTestId("adjust-balance-modal-close"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes on Escape key press when not dirty", () => {
    render(<AdjustBalanceModal {...defaultProps} />);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("shows confirm dialog on Escape when form is dirty", async () => {
    const user = userEvent.setup();

    render(<AdjustBalanceModal {...defaultProps} />);

    const balanceInput = screen.getByTestId("adjust-balance-modal-input") as HTMLInputElement;
    await user.clear(balanceInput);
    await user.type(balanceInput, "99.99");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByTestId("confirm-dialog-message").textContent).toBe(
      "You have unsaved changes. Close anyway?"
    );

    await user.click(screen.getByTestId("confirm-dialog-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("does not close on Escape while saving", async () => {
    const user = userEvent.setup();

    let resolvePromise: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(global.fetch).mockReturnValueOnce(pendingPromise);

    render(<AdjustBalanceModal {...defaultProps} />);

    await user.click(screen.getByTestId("adjust-balance-modal-save"));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(defaultProps.onClose).not.toHaveBeenCalled();

    resolvePromise!(new Response(JSON.stringify({ fundGroupId: "fg-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });
});

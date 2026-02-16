import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CatchUpModal from "../CatchUpModal";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const fundGroups = [
  {
    id: "fg-1",
    name: "Rent",
    amountNeeded: 1000,
    currentBalance: 400,
  },
  {
    id: "fg-2",
    name: "Insurance",
    amountNeeded: 500,
    currentBalance: 200,
  },
  {
    id: "fg-3",
    name: "Holiday",
    amountNeeded: 2000,
    currentBalance: 1000,
  },
];

const defaultProps = {
  fundGroups,
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

describe("CatchUpModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders amount input and total shortfall", () => {
    render(<CatchUpModal {...defaultProps} />);

    expect(screen.getByTestId("catchup-modal")).toBeDefined();
    expect(screen.getByTestId("catchup-amount-input")).toBeDefined();
    // Total shortfall: (1000-400) + (500-200) + (2000-1000) = 600 + 300 + 1000 = 1900
    expect(screen.getByTestId("catchup-total-shortfall").textContent).toBe(
      "Total shortfall: $1900.00"
    );
  });

  it("shows all funded message when no shortfall exists", () => {
    const funded = [
      {
        id: "fg-1",
        name: "Rent",
        amountNeeded: 1000,
        currentBalance: 1000,
      },
      {
        id: "fg-2",
        name: "Insurance",
        amountNeeded: 500,
        currentBalance: 600,
      },
    ];

    render(<CatchUpModal {...defaultProps} fundGroups={funded} />);

    expect(screen.getByTestId("catchup-all-funded").textContent).toBe(
      "All obligations are already fully funded — no catch-up needed"
    );
  });

  it("validates zero amount", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "0");
    await user.click(screen.getByTestId("catchup-confirm"));

    expect(screen.getByTestId("catchup-validation-error").textContent).toBe(
      "Amount must be greater than zero"
    );
  });

  it("validates empty amount", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    await user.click(screen.getByTestId("catchup-confirm"));

    expect(screen.getByTestId("catchup-validation-error").textContent).toBe(
      "Amount must be greater than zero"
    );
  });

  it("shows distribution preview after entering amount", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "800");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Should show distribution preview
    expect(screen.getByTestId("catchup-distribution")).toBeDefined();

    // Sorted by largest shortfall: Holiday (1000), Rent (600), Insurance (300)
    // Holiday gets 800, Rent gets 0, Insurance gets 0
    const rentAlloc = screen.getByTestId("catchup-alloc-fg-1") as HTMLInputElement;
    const insuranceAlloc = screen.getByTestId("catchup-alloc-fg-2") as HTMLInputElement;
    const holidayAlloc = screen.getByTestId("catchup-alloc-fg-3") as HTMLInputElement;

    expect(parseFloat(holidayAlloc.value)).toBe(800);
    expect(parseFloat(rentAlloc.value)).toBe(0);
    expect(parseFloat(insuranceAlloc.value)).toBe(0);
  });

  it("distributes prioritizing by largest shortfall", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "1500");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Sorted by largest shortfall: Holiday (1000), Rent (600), Insurance (300)
    // Holiday gets 1000, Rent gets 500, Insurance gets 0
    const rentAlloc = screen.getByTestId("catchup-alloc-fg-1") as HTMLInputElement;
    const insuranceAlloc = screen.getByTestId("catchup-alloc-fg-2") as HTMLInputElement;
    const holidayAlloc = screen.getByTestId("catchup-alloc-fg-3") as HTMLInputElement;

    expect(parseFloat(holidayAlloc.value)).toBe(1000);
    expect(parseFloat(rentAlloc.value)).toBe(500);
    expect(parseFloat(insuranceAlloc.value)).toBe(0);
  });

  it("allows adjusting individual allocations", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "800");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Modify Holiday allocation (which got the full 800)
    const holidayAlloc = screen.getByTestId("catchup-alloc-fg-3") as HTMLInputElement;
    await user.clear(holidayAlloc);
    await user.type(holidayAlloc, "400");

    // Sum should update
    const sum = screen.getByTestId("catchup-allocation-sum");
    // 400 + 0 + 0 = 400, but lumpSum is 800 so mismatch
    expect(sum.textContent).toBe("$400.00");
  });

  it("submits bulk contributions successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ balances: [] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "900");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Verify preview is shown, then confirm
    expect(screen.getByTestId("catchup-distribution")).toBeDefined();
    await user.click(screen.getByTestId("catchup-confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contributions/bulk",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        })
      );
    });

    // Verify the body contains correct contributions
    const callArgs = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string) as {
      contributions: Array<{ fundGroupId: string; amount: number }>;
    };
    // Sorted by largest shortfall: Holiday (1000) gets 900, rest get 0
    expect(body.contributions).toHaveLength(1);
    expect(body.contributions[0].fundGroupId).toBe("fg-3");
    expect(body.contributions[0].amount).toBe(900);

    expect(defaultProps.onSaved).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "budget-data-changed" })
    );
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "600");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Preview shown, confirm
    await user.click(screen.getByTestId("catchup-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("catchup-error")).toBeDefined();
    });
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    await user.click(screen.getByTestId("catchup-cancel"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    await user.click(screen.getByTestId("catchup-modal-close"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("goes back from preview to amount input when Back is clicked", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "500");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Should show preview
    expect(screen.getByTestId("catchup-distribution")).toBeDefined();
    expect(screen.getByTestId("catchup-cancel").textContent).toBe("Back");

    // Click Back
    await user.click(screen.getByTestId("catchup-cancel"));

    // Should be back to amount input
    expect(screen.getByTestId("catchup-amount-input")).toBeDefined();
  });

  it("closes on Escape key press when not dirty", () => {
    render(<CatchUpModal {...defaultProps} />);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("shows confirm dialog on Escape when form is dirty", async () => {
    const user = userEvent.setup();

    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "500");

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

    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "900");
    await user.click(screen.getByTestId("catchup-confirm"));

    // In preview mode, click confirm to trigger save
    await user.click(screen.getByTestId("catchup-confirm"));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(defaultProps.onClose).not.toHaveBeenCalled();

    resolvePromise!(new Response(JSON.stringify({ balances: [] }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CatchUpModal from "../CatchUpModal";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const obligations = [
  {
    id: "ob-1",
    name: "Rent",
    amountNeeded: 1000,
    currentBalance: 400,
    nextDueDate: "2025-02-15T00:00:00.000Z",
  },
  {
    id: "ob-2",
    name: "Insurance",
    amountNeeded: 500,
    currentBalance: 200,
    nextDueDate: "2025-03-01T00:00:00.000Z",
  },
  {
    id: "ob-3",
    name: "Holiday",
    amountNeeded: 2000,
    currentBalance: 1000,
    nextDueDate: "2025-06-01T00:00:00.000Z",
  },
];

const defaultProps = {
  obligations,
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
        id: "ob-1",
        name: "Rent",
        amountNeeded: 1000,
        currentBalance: 1000,
        nextDueDate: "2025-02-15T00:00:00.000Z",
      },
      {
        id: "ob-2",
        name: "Insurance",
        amountNeeded: 500,
        currentBalance: 600,
        nextDueDate: "2025-03-01T00:00:00.000Z",
      },
    ];

    render(<CatchUpModal {...defaultProps} obligations={funded} />);

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

    // Rent (nearest due) gets 600 (its shortfall), Insurance gets remaining 200
    const rentAlloc = screen.getByTestId("catchup-alloc-ob-1") as HTMLInputElement;
    const insuranceAlloc = screen.getByTestId("catchup-alloc-ob-2") as HTMLInputElement;
    const holidayAlloc = screen.getByTestId("catchup-alloc-ob-3") as HTMLInputElement;

    expect(parseFloat(rentAlloc.value)).toBe(600);
    expect(parseFloat(insuranceAlloc.value)).toBe(200);
    expect(parseFloat(holidayAlloc.value)).toBe(0);
  });

  it("distributes prioritizing by nearest due date", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "1500");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Rent shortfall: 600, Insurance shortfall: 300, Holiday shortfall: 1000
    // Rent gets 600, Insurance gets 300, Holiday gets 600 (remaining)
    const rentAlloc = screen.getByTestId("catchup-alloc-ob-1") as HTMLInputElement;
    const insuranceAlloc = screen.getByTestId("catchup-alloc-ob-2") as HTMLInputElement;
    const holidayAlloc = screen.getByTestId("catchup-alloc-ob-3") as HTMLInputElement;

    expect(parseFloat(rentAlloc.value)).toBe(600);
    expect(parseFloat(insuranceAlloc.value)).toBe(300);
    expect(parseFloat(holidayAlloc.value)).toBe(600);
  });

  it("allows adjusting individual allocations", async () => {
    const user = userEvent.setup();
    render(<CatchUpModal {...defaultProps} />);

    const input = screen.getByTestId("catchup-amount-input") as HTMLInputElement;
    await user.type(input, "800");
    await user.click(screen.getByTestId("catchup-confirm"));

    // Modify Rent allocation
    const rentAlloc = screen.getByTestId("catchup-alloc-ob-1") as HTMLInputElement;
    await user.clear(rentAlloc);
    await user.type(rentAlloc, "400");

    // Sum should update
    const sum = screen.getByTestId("catchup-allocation-sum");
    // 400 + 200 + 0 = 600, but lumpSum is 800 so mismatch
    expect(sum.textContent).toBe("$600.00");
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
      contributions: Array<{ obligationId: string; amount: number }>;
    };
    expect(body.contributions).toHaveLength(2); // rent 600 + insurance 300 = 900, holiday 0 excluded
    expect(body.contributions[0].obligationId).toBe("ob-1");
    expect(body.contributions[0].amount).toBe(600);
    expect(body.contributions[1].obligationId).toBe("ob-2");
    expect(body.contributions[1].amount).toBe(300);

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
});

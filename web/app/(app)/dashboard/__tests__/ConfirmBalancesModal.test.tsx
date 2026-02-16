import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import ConfirmBalancesModal from "../ConfirmBalancesModal";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockFundGroups = [
  { id: "fg1", name: "Housing", currentBalance: 800 },
  { id: "fg2", name: "Insurance", currentBalance: 200 },
];

describe("ConfirmBalancesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all fund groups with balance inputs", () => {
    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByTestId("confirm-balances-modal")).toBeDefined();
    expect(screen.getByText("Housing")).toBeDefined();
    expect(screen.getByText("Insurance")).toBeDefined();

    const housingInput = screen.getByTestId("confirm-balances-input-fg1") as HTMLInputElement;
    expect(housingInput.value).toBe("800.00");

    const insuranceInput = screen.getByTestId("confirm-balances-input-fg2") as HTMLInputElement;
    expect(insuranceInput.value).toBe("200.00");
  });

  it("calls PUT for changed balances on save", async () => {
    const onSaved = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ currentBalance: 1000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    const housingInput = screen.getByTestId("confirm-balances-input-fg1");
    fireEvent.change(housingInput, { target: { value: "1000" } });

    fireEvent.click(screen.getByTestId("confirm-balances-save"));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    // Only fg1 was changed, so only one PUT call
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/fund-groups/fg1/balance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance: 1000 }),
    });
  });

  it("does not call PUT when no balances changed", async () => {
    const onSaved = vi.fn();

    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByTestId("confirm-balances-save"));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows validation error for negative balance", async () => {
    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const housingInput = screen.getByTestId("confirm-balances-input-fg1");
    fireEvent.change(housingInput, { target: { value: "-50" } });

    fireEvent.click(screen.getByTestId("confirm-balances-save"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-balances-validation-error")).toBeDefined();
    });

    expect(
      screen.getByTestId("confirm-balances-validation-error").textContent
    ).toBe("Balance for Housing cannot be negative");
  });

  it("shows error on API failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const housingInput = screen.getByTestId("confirm-balances-input-fg1");
    fireEvent.change(housingInput, { target: { value: "1000" } });

    fireEvent.click(screen.getByTestId("confirm-balances-save"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-balances-error")).toBeDefined();
    });

    expect(screen.getByTestId("confirm-balances-error").textContent).toBe("Server error");
  });

  it("dispatches budget-data-changed event on success", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ currentBalance: 1000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const eventSpy = vi.fn();
    window.addEventListener("budget-data-changed", eventSpy);

    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const housingInput = screen.getByTestId("confirm-balances-input-fg1");
    fireEvent.change(housingInput, { target: { value: "1000" } });

    fireEvent.click(screen.getByTestId("confirm-balances-save"));

    await waitFor(() => {
      expect(eventSpy).toHaveBeenCalled();
    });

    window.removeEventListener("budget-data-changed", eventSpy);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();

    render(
      <ConfirmBalancesModal
        fundGroups={mockFundGroups}
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("confirm-balances-modal-close"));

    expect(onClose).toHaveBeenCalled();
  });
});

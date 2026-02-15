import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContributionModal from "../ContributionModal";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const defaultProps = {
  obligationId: "ob-1",
  obligationName: "Netflix",
  currentBalance: 10,
  amountNeeded: 22.99,
  recommendedContribution: 6.5,
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

describe("ContributionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Mock dispatchEvent
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with pre-filled recommended amount", () => {
    render(<ContributionModal {...defaultProps} />);

    expect(screen.getByTestId("contribution-modal")).toBeDefined();
    expect(screen.getByTestId("contribution-modal-name").textContent).toBe("Netflix");
    expect(screen.getByTestId("contribution-modal-balance").textContent).toBe("$10.00");
    expect(screen.getByTestId("contribution-modal-needed").textContent).toBe("$22.99");
    expect(screen.getByTestId("contribution-modal-remaining").textContent).toBe("$12.99");

    const amountInput = screen.getByTestId("contribution-modal-amount") as HTMLInputElement;
    expect(amountInput.value).toBe("6.50");
  });

  it("renders empty amount when recommended is zero", () => {
    render(<ContributionModal {...defaultProps} recommendedContribution={0} />);

    const amountInput = screen.getByTestId("contribution-modal-amount") as HTMLInputElement;
    expect(amountInput.value).toBe("");
  });

  it("allows custom amount input", async () => {
    const user = userEvent.setup();
    render(<ContributionModal {...defaultProps} />);

    const amountInput = screen.getByTestId("contribution-modal-amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "15.25");

    expect(amountInput.value).toBe("15.25");
  });

  it("validates zero amount", async () => {
    const user = userEvent.setup();
    render(<ContributionModal {...defaultProps} />);

    const amountInput = screen.getByTestId("contribution-modal-amount") as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "0");

    await user.click(screen.getByTestId("contribution-modal-save"));

    expect(screen.getByTestId("contribution-modal-validation-error").textContent).toBe(
      "Amount must be greater than zero"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("validates empty amount", async () => {
    const user = userEvent.setup();
    render(<ContributionModal {...defaultProps} />);

    const amountInput = screen.getByTestId("contribution-modal-amount") as HTMLInputElement;
    await user.clear(amountInput);

    await user.click(screen.getByTestId("contribution-modal-save"));

    expect(screen.getByTestId("contribution-modal-validation-error").textContent).toBe(
      "Amount must be greater than zero"
    );
  });

  it("submits contribution successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ obligationId: "ob-1", currentBalance: 16.5 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ContributionModal {...defaultProps} />);

    await user.click(screen.getByTestId("contribution-modal-save"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/contributions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            obligationId: "ob-1",
            amount: 6.5,
            type: "contribution",
          }),
        })
      );
    });

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

    render(<ContributionModal {...defaultProps} />);

    await user.click(screen.getByTestId("contribution-modal-save"));

    await waitFor(() => {
      expect(screen.getByTestId("contribution-modal-error")).toBeDefined();
    });
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ContributionModal {...defaultProps} />);

    await user.click(screen.getByTestId("contribution-modal-cancel"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ContributionModal {...defaultProps} />);

    await user.click(screen.getByTestId("contribution-modal-close"));

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("shows remaining as zero when fully funded", () => {
    render(<ContributionModal {...defaultProps} currentBalance={30} amountNeeded={22.99} />);

    expect(screen.getByTestId("contribution-modal-remaining").textContent).toBe("$0.00");
  });
});

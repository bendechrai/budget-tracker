import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EscalationForm from "../EscalationForm";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

describe("EscalationForm", () => {
  const defaultProps = {
    obligationId: "ob-1",
    obligationName: "Rent",
    currentAmount: 2000,
    onSaved: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all fields", () => {
    render(<EscalationForm {...defaultProps} />);

    expect(screen.getByLabelText("Change type")).toBeDefined();
    expect(screen.getByLabelText("Percentage")).toBeDefined();
    expect(screen.getByLabelText("Effective date")).toBeDefined();
    expect(screen.getByText("Repeats every")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save price change" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
  });

  it("renders the obligation name in the title", () => {
    render(<EscalationForm {...defaultProps} />);

    expect(screen.getByText("Add price change for Rent")).toBeDefined();
  });

  it("renders change type options", () => {
    render(<EscalationForm {...defaultProps} />);

    const select = screen.getByLabelText("Change type") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toEqual(["absolute", "percentage", "fixed_increase"]);
  });

  it("changes value label based on change type", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    // Default is percentage
    expect(screen.getByLabelText("Percentage")).toBeDefined();

    await user.selectOptions(screen.getByLabelText("Change type"), "absolute");
    expect(screen.getByLabelText("New amount")).toBeDefined();

    await user.selectOptions(screen.getByLabelText("Change type"), "fixed_increase");
    expect(screen.getByLabelText("Increase by")).toBeDefined();
  });

  it("hides recurring toggle for absolute change type", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    // Default: percentage - recurring toggle visible
    expect(screen.getByText("Repeats every")).toBeDefined();

    await user.selectOptions(screen.getByLabelText("Change type"), "absolute");
    expect(screen.queryByText("Repeats every")).toBeNull();
  });

  it("shows interval input when recurring is toggled on", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    // No interval input initially
    expect(screen.queryByLabelText("Interval months")).toBeNull();

    // Toggle recurring on
    await user.click(screen.getByTestId("recurring-toggle"));
    expect(screen.getByLabelText("Interval months")).toBeDefined();
    expect(screen.getByText("months")).toBeDefined();
  });

  it("updates preview on input changes", () => {
    render(<EscalationForm {...defaultProps} />);

    // Set value and date
    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-01-01" } });

    const preview = screen.getByTestId("escalation-preview");
    expect(preview).toBeDefined();
    // Current amount shown
    expect(screen.getByText("Current: $2000.00")).toBeDefined();
    // Preview should show the new amount: 2000 * 1.05 = 2100
    expect(screen.getByText("$2100.00")).toBeDefined();
  });

  it("shows multiple preview steps for recurring", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-01-01" } });

    // Toggle recurring
    await user.click(screen.getByTestId("recurring-toggle"));

    const preview = screen.getByTestId("escalation-preview");
    expect(preview).toBeDefined();

    // Should show up to 5 recurring steps
    const items = preview.querySelectorAll("li");
    expect(items.length).toBe(5);

    // First step: 2000 * 1.03 = 2060
    expect(screen.getByText("$2060.00")).toBeDefined();
  });

  it("submits valid escalation data", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "esc-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<EscalationForm {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText("Change type"), "percentage");
    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/escalations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            obligationId: "ob-1",
            changeType: "percentage",
            value: 3,
            effectiveDate: "2027-07-01",
            intervalMonths: null,
          }),
        }),
      );
    });

    expect(defaultProps.onSaved).toHaveBeenCalled();
  });

  it("submits recurring escalation data", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "esc-2" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    // Toggle recurring
    await user.click(screen.getByTestId("recurring-toggle"));

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/escalations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            obligationId: "ob-1",
            changeType: "percentage",
            value: 5,
            effectiveDate: "2027-07-01",
            intervalMonths: 12,
          }),
        }),
      );
    });

    expect(defaultProps.onSaved).toHaveBeenCalled();
  });

  it("shows confirmation for large increases (>50%)", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "esc-3" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "This will increase the amount by more than 50%. Is that right?",
    );

    await waitFor(() => {
      expect(defaultProps.onSaved).toHaveBeenCalled();
    });
  });

  it("cancels submit when large increase confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);

    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(defaultProps.onSaved).not.toHaveBeenCalled();
  });

  it("shows confirmation for fixed increase >50% of current amount", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "esc-4" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<EscalationForm {...defaultProps} />);

    await user.selectOptions(screen.getByLabelText("Change type"), "fixed_increase");
    fireEvent.change(screen.getByLabelText("Increase by"), { target: { value: "1500" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "This will increase the amount by more than 50%. Is that right?",
    );
  });

  it("shows validation error when value is missing", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });
    await user.click(screen.getByRole("button", { name: "Save price change" }));

    expect(screen.getByRole("alert").textContent).toBe("Value must be a non-negative number");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows validation error when date is missing", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "3" } });
    await user.click(screen.getByRole("button", { name: "Save price change" }));

    expect(screen.getByRole("alert").textContent).toBe("Effective date is required");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows API error on failed request", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "obligation not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("obligation not found");
    });

    expect(defaultProps.onSaved).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<EscalationForm {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();
    let resolveRequest: (value: Response) => void;
    vi.mocked(global.fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    await user.click(screen.getByRole("button", { name: "Save price change" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled,
    ).toBe(true);

    resolveRequest!(
      new Response(JSON.stringify({ id: "esc-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("shows absolute preview correctly", () => {
    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Change type"), { target: { value: "absolute" } });
    fireEvent.change(screen.getByLabelText("New amount"), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    expect(screen.getByText("$2500.00")).toBeDefined();
  });

  it("shows fixed increase preview correctly", () => {
    render(<EscalationForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Change type"), { target: { value: "fixed_increase" } });
    fireEvent.change(screen.getByLabelText("Increase by"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2027-07-01" } });

    // 2000 + 100 = 2100
    expect(screen.getByText("$2100.00")).toBeDefined();
  });
});

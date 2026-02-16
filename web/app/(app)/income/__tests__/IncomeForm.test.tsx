import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncomeForm from "../IncomeForm";

describe("IncomeForm", () => {
  const mockSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all required fields", () => {
    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Expected Amount")).toBeDefined();
    expect(screen.getByText("Frequency")).toBeDefined();
    expect(screen.getByLabelText("Next Expected Date")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create" })).toBeDefined();
  });

  it("renders frequency interval controls", () => {
    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.getByLabelText("Every")).toBeDefined();
    expect(screen.getByLabelText("Unit")).toBeDefined();
  });

  it("submits valid data", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "5000");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith({
      name: "Salary",
      expectedAmount: 5000,
      intervalUnit: "month",
      intervalCount: 1,
      minimumExpected: null,
      nextExpectedDate: null,
    });
  });

  it("shows validation error when name is empty", async () => {
    const user = userEvent.setup();

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe("Name is required");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when amount is invalid", async () => {
    const user = userEvent.setup();

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Expected amount must be a non-negative number"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("allows changing interval count via the Every input", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Contract");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "3000");

    // Change interval count from default 1 to 3
    await user.clear(screen.getByLabelText("Every"));
    await user.type(screen.getByLabelText("Every"), "3");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalUnit: "month",
        intervalCount: 3,
      })
    );
  });

  it("validates interval count must be positive", async () => {
    const user = userEvent.setup();

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Contract");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "3000");

    // Clear interval count to trigger validation
    await user.clear(screen.getByLabelText("Every"));

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Interval count must be a positive number"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("submits with custom interval unit and count", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Contract");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "3000");

    // Set interval to every 14 days
    await user.clear(screen.getByLabelText("Every"));
    await user.type(screen.getByLabelText("Every"), "14");
    await user.selectOptions(screen.getByLabelText("Unit"), "day");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalUnit: "day",
        intervalCount: 14,
      })
    );
  });

  it("shows helper text for variable income", () => {
    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(
      screen.getByText(/conservative estimate/)
    ).toBeDefined();
  });

  it("populates fields in edit mode", () => {
    render(
      <IncomeForm
        initialData={{
          name: "Salary",
          expectedAmount: 5000,
          intervalUnit: "month",
          intervalCount: 1,
          minimumExpected: null,
          nextExpectedDate: "2026-03-01",
        }}
        onSubmit={mockSubmit}
        submitLabel="Save Changes"
      />
    );

    expect(
      (screen.getByLabelText("Name") as HTMLInputElement).value
    ).toBe("Salary");
    expect(
      (screen.getByLabelText("Expected Amount") as HTMLInputElement).value
    ).toBe("5000");
    expect(
      (screen.getByLabelText("Next Expected Date") as HTMLInputElement).value
    ).toBe("2026-03-01");
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeDefined();

    // Monthly preset should be visually active (intervalUnit=month, intervalCount=1)
    expect(
      (screen.getByLabelText("Every") as HTMLInputElement).value
    ).toBe("1");
    expect(
      (screen.getByLabelText("Unit") as HTMLSelectElement).value
    ).toBe("month");
  });

  it("shows error from onSubmit rejection", async () => {
    const user = userEvent.setup();
    mockSubmit.mockRejectedValueOnce(new Error("email already registered"));

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "5000");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "email already registered"
    );
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void;
    mockSubmit.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      })
    );

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Salary");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "5000");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    resolveSubmit!();
  });
});

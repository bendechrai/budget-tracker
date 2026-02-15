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
    expect(screen.getByLabelText("Frequency")).toBeDefined();
    expect(
      screen.getByLabelText("Irregular income (variable timing or amount)")
    ).toBeDefined();
    expect(screen.getByLabelText("Next Expected Date")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create" })).toBeDefined();
  });

  it("renders all frequency options in dropdown", () => {
    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    const select = screen.getByLabelText("Frequency") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toEqual([
      "weekly",
      "fortnightly",
      "twice_monthly",
      "monthly",
      "quarterly",
      "annual",
      "custom",
      "irregular",
    ]);
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
      frequency: "monthly",
      frequencyDays: null,
      isIrregular: false,
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

  it("shows frequency days field when custom frequency is selected", async () => {
    const user = userEvent.setup();

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.queryByLabelText("Every how many days?")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Frequency"), "custom");

    expect(screen.getByLabelText("Every how many days?")).toBeDefined();
  });

  it("validates frequency days for custom frequency", async () => {
    const user = userEvent.setup();

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Contract");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "3000");
    await user.selectOptions(screen.getByLabelText("Frequency"), "custom");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Frequency days must be a positive number"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("submits with custom frequency and days", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Contract");
    await user.clear(screen.getByLabelText("Expected Amount"));
    await user.type(screen.getByLabelText("Expected Amount"), "3000");
    await user.selectOptions(screen.getByLabelText("Frequency"), "custom");
    await user.type(screen.getByLabelText("Every how many days?"), "14");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        frequency: "custom",
        frequencyDays: 14,
      })
    );
  });

  it("shows minimum expected field when irregular is checked", async () => {
    const user = userEvent.setup();

    render(<IncomeForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.queryByLabelText("Minimum Expected")).toBeNull();

    await user.click(
      screen.getByLabelText("Irregular income (variable timing or amount)")
    );

    expect(screen.getByLabelText("Minimum Expected")).toBeDefined();
  });

  it("populates fields in edit mode", () => {
    render(
      <IncomeForm
        initialData={{
          name: "Salary",
          expectedAmount: 5000,
          frequency: "monthly",
          frequencyDays: null,
          isIrregular: false,
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
      (screen.getByLabelText("Frequency") as HTMLSelectElement).value
    ).toBe("monthly");
    expect(
      (screen.getByLabelText("Next Expected Date") as HTMLInputElement).value
    ).toBe("2026-03-01");
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeDefined();
  });

  it("populates irregular fields in edit mode", () => {
    render(
      <IncomeForm
        initialData={{
          name: "Freelance",
          expectedAmount: 1500,
          frequency: "irregular",
          frequencyDays: null,
          isIrregular: true,
          minimumExpected: 500,
          nextExpectedDate: null,
        }}
        onSubmit={mockSubmit}
        submitLabel="Save Changes"
      />
    );

    const irregularCheckbox = screen.getByLabelText(
      "Irregular income (variable timing or amount)"
    ) as HTMLInputElement;
    expect(irregularCheckbox.checked).toBe(true);

    expect(
      (screen.getByLabelText("Minimum Expected") as HTMLInputElement).value
    ).toBe("500");
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

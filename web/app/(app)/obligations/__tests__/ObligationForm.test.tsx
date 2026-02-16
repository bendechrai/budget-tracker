import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ObligationForm from "../ObligationForm";

function setDateInput(element: HTMLInputElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

describe("ObligationForm", () => {
  const mockSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders common fields for recurring type", () => {
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Type")).toBeDefined();
    expect(screen.getByLabelText("Amount")).toBeDefined();
    expect(screen.getByText("Frequency")).toBeDefined();
    expect(screen.getByLabelText("Every")).toBeDefined();
    expect(screen.getByLabelText("Unit")).toBeDefined();
    expect(screen.getByLabelText("Next Due Date")).toBeDefined();
    expect(screen.getByRole("button", { name: "Create" })).toBeDefined();
  });

  it("renders all type options in dropdown", () => {
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    const select = screen.getByLabelText("Type") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toEqual([
      "recurring",
      "recurring_with_end",
      "one_off",
      "custom",
    ]);
  });

  it("shows frequency controls for recurring type", () => {
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.getByLabelText("Every")).toBeDefined();
    expect(screen.getByLabelText("Unit")).toBeDefined();
    expect(screen.queryByLabelText("End Date")).toBeNull();
  });

  it("shows end date field for recurring_with_end type", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.selectOptions(screen.getByLabelText("Type"), "recurring_with_end");

    expect(screen.getByText("Frequency")).toBeDefined();
    expect(screen.getByLabelText("End Date")).toBeDefined();
  });

  it("hides frequency for one_off type", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.selectOptions(screen.getByLabelText("Type"), "one_off");

    expect(screen.queryByText("Frequency")).toBeNull();
    expect(screen.queryByLabelText("Every")).toBeNull();
    expect(screen.queryByLabelText("Unit")).toBeNull();
    expect(screen.queryByLabelText("End Date")).toBeNull();
  });

  it("shows custom schedule entries for custom type", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.selectOptions(screen.getByLabelText("Type"), "custom");

    expect(screen.queryByText("Frequency")).toBeNull();
    expect(screen.getByText("Schedule Entries")).toBeDefined();
    expect(screen.getByText("Add entry")).toBeDefined();
  });

  it("adds and removes custom schedule entries", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.selectOptions(screen.getByLabelText("Type"), "custom");

    // Initially one entry, no remove button
    expect(screen.queryByLabelText("Remove entry 1")).toBeNull();

    // Add an entry
    await user.click(screen.getByText("Add entry"));

    // Now two entries with remove buttons
    expect(screen.getByLabelText("Remove entry 1")).toBeDefined();
    expect(screen.getByLabelText("Remove entry 2")).toBeDefined();

    // Remove first entry
    await user.click(screen.getByLabelText("Remove entry 1"));

    // Back to one entry, no remove button
    expect(screen.queryByLabelText("Remove entry 1")).toBeNull();
  });

  it("allows changing interval unit via dropdown", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-02-01");

    // Change to quarterly
    await user.selectOptions(screen.getByLabelText("Unit"), "quarter");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalUnit: "quarter",
        intervalCount: 1,
      })
    );
  });

  it("submits valid recurring obligation data", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Netflix");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "22.99");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-02-01");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith({
      name: "Netflix",
      type: "recurring",
      amount: 22.99,
      intervalUnit: "month",
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2026-02-01",
      fundGroupId: undefined,
      customEntries: [],
    });
  });

  it("submits valid one_off obligation data", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.selectOptions(screen.getByLabelText("Type"), "one_off");
    await user.type(screen.getByLabelText("Name"), "Car rego");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "850");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-07-15");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith({
      name: "Car rego",
      type: "one_off",
      amount: 850,
      intervalUnit: null,
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2026-07-15",
      fundGroupId: undefined,
      customEntries: [],
    });
  });

  it("submits valid custom obligation with entries", async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValueOnce(undefined);

    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Council tax");
    // Fill amount before switching to custom type (which adds another Amount label)
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "1800");

    await user.selectOptions(screen.getByLabelText("Type"), "custom");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-09-15");

    // Fill first entry date and amount using their specific IDs
    const entryDateInput = document.getElementById(
      "custom-entry-date-0"
    ) as HTMLInputElement;
    setDateInput(entryDateInput, "2026-09-15");

    const entryAmountInput = document.getElementById(
      "custom-entry-amount-0"
    ) as HTMLInputElement;
    await user.type(entryAmountInput, "180");

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockSubmit).toHaveBeenCalledWith({
      name: "Council tax",
      type: "custom",
      amount: 1800,
      intervalUnit: null,
      intervalCount: 1,
      endDate: null,
      nextDueDate: "2026-09-15",
      fundGroupId: undefined,
      customEntries: [{ dueDate: "2026-09-15", amount: 180 }],
    });
  });

  it("shows validation error when name is empty", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-02-01");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe("Name is required");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when amount is invalid", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Test");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-02-01");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Amount must be a non-negative number"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when next due date is missing", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Next due date is required"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when end date is missing for recurring_with_end", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.selectOptions(screen.getByLabelText("Type"), "recurring_with_end");
    await user.type(screen.getByLabelText("Name"), "Tax repayment");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "200");
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-02-01");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "End date is required for recurring obligations with an end date"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("validates interval count must be positive", async () => {
    const user = userEvent.setup();
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    // Clear interval count to trigger validation
    await user.clear(screen.getByLabelText("Every"));
    setDateInput(screen.getByLabelText("Next Due Date") as HTMLInputElement, "2026-02-01");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Interval count must be a positive number"
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("populates fields in edit mode", () => {
    render(
      <ObligationForm
        initialData={{
          name: "Netflix",
          type: "recurring",
          amount: 22.99,
          intervalUnit: "month",
          intervalCount: 1,
          endDate: null,
          nextDueDate: "2026-02-01",
          fundGroupId: undefined,
          customEntries: [],
        }}
        onSubmit={mockSubmit}
        submitLabel="Save Changes"
      />
    );

    expect(
      (screen.getByLabelText("Name") as HTMLInputElement).value
    ).toBe("Netflix");
    expect(
      (screen.getByLabelText("Type") as HTMLSelectElement).value
    ).toBe("recurring");
    expect(
      (screen.getByLabelText("Amount") as HTMLInputElement).value
    ).toBe("22.99");
    expect(
      (screen.getByLabelText("Every") as HTMLInputElement).value
    ).toBe("1");
    expect(
      (screen.getByLabelText("Unit") as HTMLSelectElement).value
    ).toBe("month");
    expect(
      (screen.getByLabelText("Next Due Date") as HTMLInputElement).value
    ).toBe("2026-02-01");
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeDefined();
  });

  it("renders fund group dropdown when groups are provided", () => {
    const groups = [
      { id: "g1", name: "Housing" },
      { id: "g2", name: "Insurance" },
    ];

    render(
      <ObligationForm
        fundGroups={groups}
        onSubmit={mockSubmit}
        submitLabel="Create"
      />
    );

    const select = screen.getByLabelText("Sinking Fund") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);

    expect(options).toEqual(["Housing", "Insurance"]);
  });

  it("does not render fund group dropdown when no groups", () => {
    render(<ObligationForm onSubmit={mockSubmit} submitLabel="Create" />);

    expect(screen.queryByLabelText("Sinking Fund")).toBeNull();
  });

  it("shows error from onSubmit rejection", async () => {
    const user = userEvent.setup();
    mockSubmit.mockRejectedValueOnce(new Error("something broke"));

    render(
      <ObligationForm
        initialData={{
          nextDueDate: "2026-02-01",
        }}
        onSubmit={mockSubmit}
        submitLabel="Create"
      />
    );

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toBe("something broke");
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void;
    mockSubmit.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      })
    );

    render(
      <ObligationForm
        initialData={{
          nextDueDate: "2026-02-01",
        }}
        onSubmit={mockSubmit}
        submitLabel="Create"
      />
    );

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    resolveSubmit!();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FundPill from "../FundPill";

const allFunds = [
  { id: "g0", name: "Ungrouped" },
  { id: "g1", name: "Bills" },
  { id: "g2", name: "Subscriptions" },
];

const singleFund = [{ id: "g0", name: "Ungrouped" }];

describe("FundPill", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the current fund name", () => {
    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={allFunds}
        onMoveFund={vi.fn()}
      />
    );

    expect(screen.getByText("Ungrouped")).toBeDefined();
  });

  it("renders as static (non-clickable) when only one fund exists", () => {
    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={singleFund}
        onMoveFund={vi.fn()}
      />
    );

    const pill = screen.getByTestId("fund-pill-ob1");
    expect(pill.tagName).toBe("SPAN");
  });

  it("renders as a button when multiple funds exist", () => {
    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={allFunds}
        onMoveFund={vi.fn()}
      />
    );

    const pill = screen.getByTestId("fund-pill-ob1");
    expect(pill.tagName).toBe("BUTTON");
  });

  it("opens dropdown on click when multiple funds exist", async () => {
    const user = userEvent.setup();

    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={allFunds}
        onMoveFund={vi.fn()}
      />
    );

    await user.click(screen.getByTestId("fund-pill-ob1"));

    expect(screen.getByTestId("fund-dropdown-ob1")).toBeDefined();
  });

  it("dropdown excludes the current fund", async () => {
    const user = userEvent.setup();

    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={allFunds}
        onMoveFund={vi.fn()}
      />
    );

    await user.click(screen.getByTestId("fund-pill-ob1"));

    const dropdown = screen.getByTestId("fund-dropdown-ob1");
    expect(dropdown.querySelectorAll("[role='option']").length).toBe(2);
    expect(screen.getByTestId("fund-option-g1")).toBeDefined();
    expect(screen.getByTestId("fund-option-g2")).toBeDefined();
    expect(screen.queryByTestId("fund-option-g0")).toBeNull();
  });

  it("calls onMoveFund on selection and closes dropdown", async () => {
    const user = userEvent.setup();
    const onMoveFund = vi.fn();

    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={allFunds}
        onMoveFund={onMoveFund}
      />
    );

    await user.click(screen.getByTestId("fund-pill-ob1"));
    await user.click(screen.getByTestId("fund-option-g1"));

    expect(onMoveFund).toHaveBeenCalledWith("ob1", "g1");
    expect(screen.queryByTestId("fund-dropdown-ob1")).toBeNull();
  });

  it("closes dropdown on Escape key", async () => {
    const user = userEvent.setup();

    render(
      <FundPill
        obligationId="ob1"
        currentFundId="g0"
        currentFundName="Ungrouped"
        allFunds={allFunds}
        onMoveFund={vi.fn()}
      />
    );

    await user.click(screen.getByTestId("fund-pill-ob1"));
    expect(screen.getByTestId("fund-dropdown-ob1")).toBeDefined();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("fund-dropdown-ob1")).toBeNull();
  });

  it("closes dropdown on click outside", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <div data-testid="outside">Outside</div>
        <FundPill
          obligationId="ob1"
          currentFundId="g0"
          currentFundName="Ungrouped"
          allFunds={allFunds}
          onMoveFund={vi.fn()}
        />
      </div>
    );

    await user.click(screen.getByTestId("fund-pill-ob1"));
    expect(screen.getByTestId("fund-dropdown-ob1")).toBeDefined();

    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByTestId("fund-dropdown-ob1")).toBeNull();
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhatIfProvider, useWhatIf } from "../WhatIfContext";

function TestConsumer() {
  const {
    overrides,
    isActive,
    toggleObligation,
    overrideAmount,
    addHypothetical,
    removeHypothetical,
    resetAll,
    changeSummary,
  } = useWhatIf();

  return (
    <div>
      <span data-testid="is-active">{String(isActive)}</span>
      <span data-testid="toggled-off">
        {JSON.stringify([...overrides.toggledOffIds])}
      </span>
      <span data-testid="amount-overrides">
        {JSON.stringify([...overrides.amountOverrides.entries()])}
      </span>
      <span data-testid="hypotheticals">
        {JSON.stringify(overrides.hypotheticals.map((h) => h.id))}
      </span>
      <span data-testid="summary">{changeSummary}</span>

      <button onClick={() => toggleObligation("obl-1")}>Toggle obl-1</button>
      <button onClick={() => toggleObligation("obl-2")}>Toggle obl-2</button>
      <button onClick={() => overrideAmount("obl-1", 50)}>Override obl-1 amount</button>
      <button onClick={() => overrideAmount("obl-2", 100)}>Override obl-2 amount</button>
      <button
        onClick={() =>
          addHypothetical({
            id: "hyp-1",
            name: "Holiday",
            type: "one_off",
            amount: 2000,
            frequency: null,
            frequencyDays: null,
            nextDueDate: new Date("2025-12-01"),
            endDate: null,
            fundGroupId: null,
          })
        }
      >
        Add hypothetical
      </button>
      <button onClick={() => removeHypothetical("hyp-1")}>Remove hypothetical</button>
      <button onClick={() => resetAll()}>Reset</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <WhatIfProvider>
      <TestConsumer />
    </WhatIfProvider>
  );
}

describe("WhatIfContext", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts inactive with empty overrides", () => {
    renderWithProvider();

    expect(screen.getByTestId("is-active").textContent).toBe("false");
    expect(screen.getByTestId("toggled-off").textContent).toBe("[]");
    expect(screen.getByTestId("amount-overrides").textContent).toBe("[]");
    expect(screen.getByTestId("hypotheticals").textContent).toBe("[]");
    expect(screen.getByTestId("summary").textContent).toBe("");
  });

  it("toggles an obligation off and back on", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("Toggle obl-1"));

    expect(screen.getByTestId("is-active").textContent).toBe("true");
    expect(screen.getByTestId("toggled-off").textContent).toBe('["obl-1"]');
    expect(screen.getByTestId("summary").textContent).toBe("1 expense toggled off");

    await user.click(screen.getByText("Toggle obl-1"));

    expect(screen.getByTestId("is-active").textContent).toBe("false");
    expect(screen.getByTestId("toggled-off").textContent).toBe("[]");
  });

  it("overrides an obligation amount", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("Override obl-1 amount"));

    expect(screen.getByTestId("is-active").textContent).toBe("true");
    expect(screen.getByTestId("amount-overrides").textContent).toBe(
      '[["obl-1",50]]'
    );
    expect(screen.getByTestId("summary").textContent).toBe("1 amount changed");
  });

  it("adds a hypothetical obligation", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("Add hypothetical"));

    expect(screen.getByTestId("is-active").textContent).toBe("true");
    expect(screen.getByTestId("hypotheticals").textContent).toBe('["hyp-1"]');
    expect(screen.getByTestId("summary").textContent).toBe("1 hypothetical added");
  });

  it("removes a hypothetical obligation", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("Add hypothetical"));
    expect(screen.getByTestId("hypotheticals").textContent).toBe('["hyp-1"]');

    await user.click(screen.getByText("Remove hypothetical"));
    expect(screen.getByTestId("hypotheticals").textContent).toBe("[]");
    expect(screen.getByTestId("is-active").textContent).toBe("false");
  });

  it("reset clears all overrides", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("Toggle obl-1"));
    await user.click(screen.getByText("Toggle obl-2"));
    await user.click(screen.getByText("Override obl-1 amount"));
    await user.click(screen.getByText("Add hypothetical"));

    expect(screen.getByTestId("is-active").textContent).toBe("true");
    expect(screen.getByTestId("summary").textContent).toBe(
      "2 expenses toggled off, 1 amount changed, 1 hypothetical added"
    );

    await user.click(screen.getByText("Reset"));

    expect(screen.getByTestId("is-active").textContent).toBe("false");
    expect(screen.getByTestId("toggled-off").textContent).toBe("[]");
    expect(screen.getByTestId("amount-overrides").textContent).toBe("[]");
    expect(screen.getByTestId("hypotheticals").textContent).toBe("[]");
    expect(screen.getByTestId("summary").textContent).toBe("");
  });

  it("builds correct summary with multiple changes", async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByText("Toggle obl-1"));
    await user.click(screen.getByText("Override obl-2 amount"));

    expect(screen.getByTestId("summary").textContent).toBe(
      "1 expense toggled off, 1 amount changed"
    );
  });

  it("throws error when used outside provider", () => {
    const consoleError = console.error;
    console.error = () => {};

    expect(() => render(<TestConsumer />)).toThrow(
      "useWhatIf must be used within a WhatIfProvider"
    );

    console.error = consoleError;
  });
});

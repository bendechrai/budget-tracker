import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { useModalClose } from "../useModalClose";

/**
 * Helper that wraps useModalClose in a component that renders its confirmDialog,
 * so that the styled ConfirmDialog can appear in the DOM for interaction.
 */
function renderUseModalClose(
  onClose: () => void,
  isDirty: boolean,
  enabled = true,
  onSubmit?: () => void,
) {
  function TestComponent() {
    const { handleClose, confirmDialog } = useModalClose(onClose, isDirty, enabled, onSubmit);
    return createElement("div", { "data-testid": "hook-host" },
      confirmDialog,
      createElement("button", { "data-testid": "trigger-close", onClick: handleClose }, "Close"),
    );
  }

  return render(createElement(TestComponent));
}

describe("useModalClose", () => {
  let onClose: () => void;

  beforeEach(() => {
    onClose = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls onClose on Escape when not dirty", () => {
    renderUseModalClose(onClose, false);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows confirm dialog on Escape when dirty and closes on confirm", async () => {
    const user = userEvent.setup();
    renderUseModalClose(onClose, true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    // ConfirmDialog should appear
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByTestId("confirm-dialog-message").textContent).toBe(
      "You have unsaved changes. Close anyway?",
    );

    await user.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows confirm dialog on Escape when dirty and stays open on cancel", async () => {
    const user = userEvent.setup();
    renderUseModalClose(onClose, true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    await user.click(screen.getByTestId("confirm-dialog-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when enabled is false", () => {
    renderUseModalClose(onClose, false, false);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("returned handleClose behaves same as Escape", async () => {
    const user = userEvent.setup();
    renderUseModalClose(onClose, false);

    await user.click(screen.getByTestId("trigger-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returned handleClose shows confirm dialog when dirty", async () => {
    const user = userEvent.setup();
    renderUseModalClose(onClose, true);

    await user.click(screen.getByTestId("trigger-close"));

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    await user.click(screen.getByTestId("confirm-dialog-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores non-Escape keys when no onSubmit provided", () => {
    renderUseModalClose(onClose, false);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onSubmit on Enter when provided", () => {
    const onSubmit = vi.fn();
    renderUseModalClose(onClose, false, true, onSubmit);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onSubmit on Enter when enabled is false", () => {
    const onSubmit = vi.fn();
    renderUseModalClose(onClose, false, false, onSubmit);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not call onSubmit on Enter while confirm dialog is open", () => {
    const onSubmit = vi.fn();
    renderUseModalClose(onClose, true, true, onSubmit);

    // Open the confirm dialog via Escape
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    // Enter should not trigger onSubmit while confirming
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cleans up event listener on unmount", () => {
    const { unmount } = renderUseModalClose(onClose, false);

    unmount();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores second Escape while confirm dialog is open", async () => {
    renderUseModalClose(onClose, true);

    // First Escape opens confirm dialog
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();

    // Second Escape should dismiss the confirm dialog (handled by ConfirmDialog itself),
    // not open another one
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    // Confirm dialog should be dismissed (onCancel called by ConfirmDialog's Escape handler)
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });

    // The modal should NOT have been closed
    expect(onClose).not.toHaveBeenCalled();
  });
});

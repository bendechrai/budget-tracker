import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../ConfirmDialog";

describe("ConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("renders title, message, and buttons when open", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Confirm action"
        message="Are you sure?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByText("Confirm action")).toBeDefined();
    expect(screen.getByTestId("confirm-dialog-message").textContent).toBe(
      "Are you sure?",
    );
    expect(screen.getByTestId("confirm-dialog-confirm").textContent).toBe(
      "Yes",
    );
    expect(screen.getByTestId("confirm-dialog-cancel").textContent).toBe("No");
  });

  it("calls onConfirm on confirm button click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test message"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("confirm-dialog-confirm"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on cancel button click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByTestId("confirm-dialog-cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape key", () => {
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when clicking overlay", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByTestId("confirm-dialog-overlay"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when clicking the modal card", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByTestId("confirm-dialog"));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses default labels when not specified", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("confirm-dialog-confirm").textContent).toBe(
      "Confirm",
    );
    expect(screen.getByTestId("confirm-dialog-cancel").textContent).toBe(
      "Cancel",
    );
  });

  it("has accessible dialog role", () => {
    render(
      <ConfirmDialog
        open={true}
        title="My Dialog"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

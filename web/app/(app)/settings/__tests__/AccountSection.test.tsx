import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountSection from "../AccountSection";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

describe("AccountSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders export data button", () => {
    render(<AccountSection />);

    expect(screen.getByRole("heading", { name: "Export Data" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Export Data" })).toBeDefined();
  });

  it("triggers download on export button click", async () => {
    const user = userEvent.setup();

    const blobContent = new Blob(["zipdata"], { type: "application/zip" });
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(blobContent, {
        status: 200,
        headers: { "Content-Type": "application/zip" },
      })
    );

    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();

    render(<AccountSection />);

    await user.click(screen.getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/user/export", {
        method: "POST",
      });
    });
  });

  it("shows error on export failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AccountSection />);

    await user.click(screen.getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to export data")).toBeDefined();
    });
  });

  it("opens delete account modal on button click", async () => {
    const user = userEvent.setup();
    render(<AccountSection />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));

    expect(screen.getByRole("dialog", { name: "Delete account" })).toBeDefined();
    expect(screen.getByLabelText("Type DELETE to confirm")).toBeDefined();
  });

  it("disables delete button until DELETE is typed", async () => {
    const user = userEvent.setup();
    render(<AccountSection />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));

    const confirmBtn = screen.getByTestId("delete-account-modal-confirm") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "wrong");
    expect(confirmBtn.disabled).toBe(true);

    await user.clear(screen.getByLabelText("Type DELETE to confirm"));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(confirmBtn.disabled).toBe(false);
  });

  it("deletes account and redirects on valid confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<AccountSection />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByTestId("delete-account-modal-confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows API error on delete failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'confirmation must be the string "DELETE"' }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    render(<AccountSection />);

    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByTestId("delete-account-modal-confirm"));

    await waitFor(() => {
      expect(
        screen.getByText('confirmation must be the string "DELETE"')
      ).toBeDefined();
    });
  });
});

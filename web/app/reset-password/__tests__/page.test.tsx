import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the reset password form with email and submit button", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Send reset link" })
    ).toBeDefined();
  });

  it("renders a link back to login", () => {
    render(<ResetPasswordPage />);

    const link = screen.getByRole("link", { name: "Log in" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("shows success message after submitting email", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message:
            "if an account with that email exists, a reset link has been sent",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "if an account with that email exists, a reset link has been sent"
      );
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
  });

  it("shows error message on server error", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("email is required");
    });
  });

  it("shows a generic error on network failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("network error"));

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "something went wrong, please try again"
      );
    });
  });

  it("disables the submit button while submitting", async () => {
    const user = userEvent.setup();
    let resolveResponse: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.mocked(global.fetch).mockReturnValueOnce(pending);

    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      screen.getByRole("button", { name: "Sending..." })
    ).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Sending..." }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    resolveResponse!(
      new Response(
        JSON.stringify({
          message:
            "if an account with that email exists, a reset link has been sent",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  });
});

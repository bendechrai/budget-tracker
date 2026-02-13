import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetConfirmPage from "../page";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: mockGet }),
}));

describe("ResetConfirmPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows invalid link message when no token is present", () => {
    mockGet.mockReturnValue(null);
    render(<ResetConfirmPage />);

    expect(screen.getByText("Invalid link")).toBeDefined();
    expect(
      screen.getByText(
        "This password reset link is invalid or has expired."
      )
    ).toBeDefined();
    const link = screen.getByRole("link", {
      name: "Request a new reset link",
    });
    expect(link.getAttribute("href")).toBe("/reset-password");
  });

  it("renders the password form when token is present", () => {
    mockGet.mockReturnValue("valid-token-123");
    render(<ResetConfirmPage />);

    expect(screen.getByLabelText("New password")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Reset password" })
    ).toBeDefined();
  });

  it("renders a link back to login", () => {
    mockGet.mockReturnValue("valid-token-123");
    render(<ResetConfirmPage />);

    const link = screen.getByRole("link", { name: "Back to login" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("shows success message after resetting password", async () => {
    mockGet.mockReturnValue("valid-token-123");
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "password has been reset" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<ResetConfirmPage />);

    await user.type(screen.getByLabelText("New password"), "newsecurepass123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Your password has been reset. You can now log in."
      );
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/reset-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "valid-token-123",
        password: "newsecurepass123",
      }),
    });
  });

  it("shows error on invalid or expired token", async () => {
    mockGet.mockReturnValue("expired-token");
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "invalid or expired reset token" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<ResetConfirmPage />);

    await user.type(screen.getByLabelText("New password"), "newsecurepass123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "invalid or expired reset token"
      );
    });
  });

  it("shows a generic error on network failure", async () => {
    mockGet.mockReturnValue("valid-token-123");
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("network error"));

    render(<ResetConfirmPage />);

    await user.type(screen.getByLabelText("New password"), "newsecurepass123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "something went wrong, please try again"
      );
    });
  });

  it("disables the submit button while submitting", async () => {
    mockGet.mockReturnValue("valid-token-123");
    const user = userEvent.setup();
    let resolveResponse: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.mocked(global.fetch).mockReturnValueOnce(pending);

    render(<ResetConfirmPage />);

    await user.type(screen.getByLabelText("New password"), "newsecurepass123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(
      screen.getByRole("button", { name: "Resetting..." })
    ).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Resetting...",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    resolveResponse!(
      new Response(
        JSON.stringify({ message: "password has been reset" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
  });

  it("disables the submit button after successful reset", async () => {
    mockGet.mockReturnValue("valid-token-123");
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "password has been reset" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<ResetConfirmPage />);

    await user.type(screen.getByLabelText("New password"), "newsecurepass123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeDefined();
    });

    expect(
      (screen.getByRole("button", { name: "Reset password" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});

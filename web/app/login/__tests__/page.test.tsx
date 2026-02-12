import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../page";

const mockPush = vi.fn();
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockGet }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    mockGet.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the login form with email, password, and submit button", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Log in" })).toBeDefined();
  });

  it("renders a link to the signup page", () => {
    render(<LoginPage />);

    const link = screen.getByRole("link", { name: "Sign up" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/signup");
  });

  it("submits the form and redirects to dashboard on success", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1", email: "test@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass123",
      }),
    });
  });

  it("redirects to the intended destination from query param on success", async () => {
    const user = userEvent.setup();
    mockGet.mockReturnValue("/income");
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1", email: "test@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/income");
    });
  });

  it("shows an error message on invalid credentials (401)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid email or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "invalid email or password"
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows a generic error on network failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("network error"));

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

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

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      screen.getByRole("button", { name: "Logging in..." })
    ).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Logging in...",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    resolveResponse!(
      new Response(JSON.stringify({ id: "1", email: "test@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignupPage from "../page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the signup form with email, password, and submit button", () => {
    render(<SignupPage />);

    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDefined();
  });

  it("renders a link to the login page", () => {
    render(<SignupPage />);

    const link = screen.getByRole("link", { name: "Log in" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("submits the form and redirects to onboarding on success", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1", email: "test@example.com" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/onboarding");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "securepass123",
      }),
    });
  });

  it("shows an error message on duplicate email (409)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "email already registered" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "email already registered"
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows an error message on validation failure (400)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "password must be at least 8 characters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "password must be at least 8 characters"
      );
    });
  });

  it("shows a generic error on network failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("network error"));

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

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

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "securepass123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(
      screen.getByRole("button", { name: "Creating account..." })
    ).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Creating account..." }) as HTMLButtonElement).disabled
    ).toBe(true);

    resolveResponse!(
      new Response(JSON.stringify({ id: "1", email: "test@example.com" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});

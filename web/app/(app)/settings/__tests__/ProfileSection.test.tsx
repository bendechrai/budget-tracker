import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileSection from "../ProfileSection";

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

describe("ProfileSection", () => {
  const defaultProps = {
    email: "user@example.com",
    onEmailChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders current email address", () => {
    render(<ProfileSection {...defaultProps} />);
    expect(screen.getByText("user@example.com")).toBeDefined();
  });

  it("renders change email form", () => {
    render(<ProfileSection {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "Change Email" })).toBeDefined();
    expect(screen.getByLabelText("New Email")).toBeDefined();
    expect(screen.getByLabelText("Confirm Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Update Email" })).toBeDefined();
  });

  it("renders change password form", () => {
    render(<ProfileSection {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "Change Password" })).toBeDefined();
    expect(screen.getByLabelText("New Password")).toBeDefined();
    expect(screen.getByLabelText("Confirm New Password")).toBeDefined();
    expect(screen.getByRole("button", { name: "Update Password" })).toBeDefined();
  });

  it("submits change email form successfully", async () => {
    const user = userEvent.setup();
    const onEmailChange = vi.fn();

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ email: "new@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ProfileSection email="user@example.com" onEmailChange={onEmailChange} />);

    await user.type(screen.getByLabelText("New Email"), "new@example.com");
    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Update Email" }));

    await waitFor(() => {
      expect(screen.getByText("Email updated successfully")).toBeDefined();
    });

    expect(onEmailChange).toHaveBeenCalledWith("new@example.com");

    expect(global.fetch).toHaveBeenCalledWith("/api/user/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newEmail: "new@example.com",
        currentPassword: "password123",
      }),
    });
  });

  it("shows validation error for empty email", async () => {
    const user = userEvent.setup();
    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Update Email" }));

    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeDefined();
    });
  });

  it("shows validation error for invalid email format", async () => {
    const user = userEvent.setup();
    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("New Email"), "invalid-email");
    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Update Email" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email format")).toBeDefined();
    });
  });

  it("shows API error on email change failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "incorrect password" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("New Email"), "new@example.com");
    await user.type(screen.getByLabelText("Confirm Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Update Email" }));

    await waitFor(() => {
      expect(screen.getByText("incorrect password")).toBeDefined();
    });
  });

  it("submits change password form successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Current Password"), "oldpassword");
    await user.type(screen.getByLabelText("New Password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm New Password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(screen.getByText("Password updated successfully")).toBeDefined();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/user/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "oldpassword",
        newPassword: "newpassword123",
      }),
    });
  });

  it("shows validation error for short password", async () => {
    const user = userEvent.setup();
    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Current Password"), "oldpassword");
    await user.type(screen.getByLabelText("New Password"), "short");
    await user.type(screen.getByLabelText("Confirm New Password"), "short");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(screen.getByText("New password must be at least 8 characters")).toBeDefined();
    });
  });

  it("shows validation error for mismatched passwords", async () => {
    const user = userEvent.setup();
    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Current Password"), "oldpassword");
    await user.type(screen.getByLabelText("New Password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm New Password"), "different123");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeDefined();
    });
  });

  it("shows API error on password change failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "incorrect password" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<ProfileSection {...defaultProps} />);

    await user.type(screen.getByLabelText("Current Password"), "wrongpassword");
    await user.type(screen.getByLabelText("New Password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm New Password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(screen.getByText("incorrect password")).toBeDefined();
    });
  });
});

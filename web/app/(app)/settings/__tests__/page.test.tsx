import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

const mockSettings = {
  email: "user@example.com",
  contributionCycleType: null,
  contributionPayDays: [],
  currencySymbol: "$",
  maxContributionPerCycle: null,
  autoDetectedCycle: { type: "monthly", payDays: [1] },
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading state initially", () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));
    render(<SettingsPage />);

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders the page title", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    expect(
      screen.getByRole("heading", { name: "Settings" })
    ).toBeDefined();
  });

  it("renders current email address", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });
  });

  it("renders change email form", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Change Email" })
      ).toBeDefined();
    });

    expect(screen.getByLabelText("New Email")).toBeDefined();
    expect(screen.getByLabelText("Confirm Password")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Update Email" })
    ).toBeDefined();
  });

  it("renders change password form", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Change Password" })
      ).toBeDefined();
    });

    expect(screen.getByLabelText("New Password")).toBeDefined();
    expect(screen.getByLabelText("Confirm New Password")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Update Password" })
    ).toBeDefined();
  });

  it("submits change email form successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSettings), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "new@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(screen.getByLabelText("New Email"), "new@example.com");
    await user.type(
      screen.getByLabelText("Confirm Password"),
      "password123"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Email" })
    );

    await waitFor(() => {
      expect(screen.getByText("Email updated successfully")).toBeDefined();
    });

    expect(screen.getByText("new@example.com")).toBeDefined();

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
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(
      screen.getByLabelText("Confirm Password"),
      "password123"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Email" })
    );

    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeDefined();
    });
  });

  it("shows validation error for invalid email format", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(screen.getByLabelText("New Email"), "invalid-email");
    await user.type(
      screen.getByLabelText("Confirm Password"),
      "password123"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Email" })
    );

    await waitFor(() => {
      expect(screen.getByText("Invalid email format")).toBeDefined();
    });
  });

  it("shows API error on email change failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSettings), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "incorrect password" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(screen.getByLabelText("New Email"), "new@example.com");
    await user.type(
      screen.getByLabelText("Confirm Password"),
      "wrongpass"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Email" })
    );

    await waitFor(() => {
      expect(screen.getByText("incorrect password")).toBeDefined();
    });
  });

  it("submits change password form successfully", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSettings), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(
      screen.getByLabelText("Current Password"),
      "oldpassword"
    );
    await user.type(screen.getByLabelText("New Password"), "newpassword123");
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "newpassword123"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Password" })
    );

    await waitFor(() => {
      expect(
        screen.getByText("Password updated successfully")
      ).toBeDefined();
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
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(
      screen.getByLabelText("Current Password"),
      "oldpassword"
    );
    await user.type(screen.getByLabelText("New Password"), "short");
    await user.type(screen.getByLabelText("Confirm New Password"), "short");
    await user.click(
      screen.getByRole("button", { name: "Update Password" })
    );

    await waitFor(() => {
      expect(
        screen.getByText("New password must be at least 8 characters")
      ).toBeDefined();
    });
  });

  it("shows validation error for mismatched passwords", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSettings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(
      screen.getByLabelText("Current Password"),
      "oldpassword"
    );
    await user.type(screen.getByLabelText("New Password"), "newpassword123");
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "different123"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Password" })
    );

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeDefined();
    });
  });

  it("shows API error on password change failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSettings), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "incorrect password" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeDefined();
    });

    await user.type(
      screen.getByLabelText("Current Password"),
      "wrongpassword"
    );
    await user.type(
      screen.getByLabelText("New Password"),
      "newpassword123"
    );
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "newpassword123"
    );
    await user.click(
      screen.getByRole("button", { name: "Update Password" })
    );

    await waitFor(() => {
      expect(screen.getByText("incorrect password")).toBeDefined();
    });
  });

  it("shows error when settings fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Failed to load settings"
      );
    });
  });
});

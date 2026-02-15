import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { sendWelcomeEmail, sendPasswordResetEmail } from "../send";
import { logError } from "@/lib/logging";

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.test.io";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_USER = "testuser";
    process.env.SMTP_PASS = "testpass";
    process.env.SMTP_FROM = "test@example.com";
  });

  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  it("sends a welcome email with correct fields", async () => {
    await sendWelcomeEmail("user@example.com");

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "test@example.com",
        to: "user@example.com",
        subject: "Welcome to Sinking Fund",
        html: expect.stringContaining("Welcome to Sinking Fund"),
      })
    );
  });

  it("uses default from address when SMTP_FROM is not set", async () => {
    delete process.env.SMTP_FROM;

    await sendWelcomeEmail("user@example.com");

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@sinkingfund.app",
      })
    );
  });

  it("does not send when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;

    await sendWelcomeEmail("user@example.com");

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("logs error but does not throw on send failure", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP down"));

    await sendWelcomeEmail("user@example.com");

    expect(logError).toHaveBeenCalledWith(
      "failed to send welcome email",
      expect.any(Error),
      { to: "user@example.com" }
    );
  });
});

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.test.io";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_USER = "testuser";
    process.env.SMTP_PASS = "testpass";
    process.env.SMTP_FROM = "test@example.com";
  });

  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  it("sends a reset email with the reset link", async () => {
    const link = "https://app.example.com/reset-password/confirm?token=abc123";

    await sendPasswordResetEmail("user@example.com", link);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "test@example.com",
        to: "user@example.com",
        subject: "Reset your Sinking Fund password",
        html: expect.stringContaining(link),
      })
    );
  });

  it("includes 1-hour expiry note in HTML", async () => {
    await sendPasswordResetEmail("user@example.com", "https://example.com/reset");

    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).toContain("1 hour");
  });

  it("falls back to console.log when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendPasswordResetEmail("user@example.com", "https://example.com/reset");

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Password reset link for user@example.com")
    );
    consoleSpy.mockRestore();
  });

  it("logs error but does not throw on send failure", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP down"));

    await sendPasswordResetEmail("user@example.com", "https://example.com/reset");

    expect(logError).toHaveBeenCalledWith(
      "failed to send password reset email",
      expect.any(Error),
      { to: "user@example.com" }
    );
  });
});

import { getTransport, isEmailConfigured } from "./transport";
import { logError } from "@/lib/logging";

const DEFAULT_FROM = "noreply@sinkingfund.app";

function getFrom(): string {
  return process.env.SMTP_FROM || DEFAULT_FROM;
}

export async function sendWelcomeEmail(to: string): Promise<void> {
  if (!isEmailConfigured()) {
    return;
  }

  const transport = getTransport();
  if (!transport) {
    return;
  }

  try {
    await transport.sendMail({
      from: getFrom(),
      to,
      subject: "Welcome to Sinking Fund",
      html: `
        <h1>Welcome to Sinking Fund!</h1>
        <p>Your account has been created successfully.</p>
        <p>Sinking Fund helps you track recurring obligations and plan ahead so you're never caught off guard by upcoming expenses.</p>
        <p>Get started by adding your income sources and obligations.</p>
      `,
    });
  } catch (error) {
    logError("failed to send welcome email", error, { to });
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(`[DEV] Password reset link for ${to}: ${resetLink}`);
    return;
  }

  const transport = getTransport();
  if (!transport) {
    return;
  }

  try {
    await transport.sendMail({
      from: getFrom(),
      to,
      subject: "Reset your Sinking Fund password",
      html: `
        <h1>Password Reset</h1>
        <p>You requested a password reset for your Sinking Fund account.</p>
        <p><a href="${resetLink}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  } catch (error) {
    logError("failed to send password reset email", error, { to });
  }
}

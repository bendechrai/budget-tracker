"use client";

import { useState, type FormEvent } from "react";
import { logError } from "@/lib/logging";
import styles from "./settings.module.css";

interface ProfileSectionProps {
  email: string;
  onEmailChange: (newEmail: string) => void;
}

export default function ProfileSection({ email, onEmailChange }: ProfileSectionProps) {
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError("");
    setEmailSuccess("");

    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) {
      setEmailError("Email is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Invalid email format");
      return;
    }

    if (!emailPassword) {
      setEmailError("Current password is required");
      return;
    }

    setEmailSubmitting(true);
    try {
      const res = await fetch("/api/user/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: trimmedEmail,
          currentPassword: emailPassword,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setEmailError(data.error || "Failed to update email");
        return;
      }

      const data = (await res.json()) as { email: string };
      onEmailChange(data.email);
      setNewEmail("");
      setEmailPassword("");
      setEmailSuccess("Email updated successfully");
    } catch (err) {
      logError("failed to update email", err);
      setEmailError("Failed to update email");
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword) {
      setPasswordError("Current password is required");
      return;
    }

    if (!newPassword) {
      setPasswordError("New password is required");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setPasswordError(data.error || "Failed to update password");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully");
    } catch (err) {
      logError("failed to update password", err);
      setPasswordError("Failed to update password");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <>
      <div className={styles.emailDisplay}>
        Email: <span className={styles.emailValue}>{email}</span>
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => void handleEmailSubmit(e)}
      >
        <h3 className={styles.formTitle}>Change Email</h3>

        {emailError && (
          <div className={styles.formError} role="alert">
            {emailError}
          </div>
        )}

        {emailSuccess && (
          <div className={styles.formSuccess} role="status">
            {emailSuccess}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-email">
            New Email
          </label>
          <input
            id="new-email"
            className={styles.input}
            type="text"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email-password">
            Confirm Password
          </label>
          <input
            id="email-password"
            className={styles.input}
            type="password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className={styles.submitButton}
          disabled={emailSubmitting}
        >
          {emailSubmitting ? "Updating..." : "Update Email"}
        </button>
      </form>

      <form
        className={styles.form}
        onSubmit={(e) => void handlePasswordSubmit(e)}
      >
        <h3 className={styles.formTitle}>Change Password</h3>

        {passwordError && (
          <div className={styles.formError} role="alert">
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div className={styles.formSuccess} role="status">
            {passwordSuccess}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="current-password">
            Current Password
          </label>
          <input
            id="current-password"
            className={styles.input}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-password">
            New Password
          </label>
          <input
            id="new-password"
            className={styles.input}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm-password">
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            className={styles.input}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className={styles.submitButton}
          disabled={passwordSubmitting}
        >
          {passwordSubmitting ? "Updating..." : "Update Password"}
        </button>
      </form>
    </>
  );
}

"use client";

import { Suspense, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../reset-password.module.css";

function ResetConfirmForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/reset-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error);
        setSubmitting(false);
        return;
      }

      setSuccess("Your password has been reset. You can now log in.");
      setSubmitting(false);
    } catch {
      setError("something went wrong, please try again");
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Invalid link</h1>
          <p className={styles.subtitle}>
            This password reset link is invalid or has expired.
          </p>
          <p className={styles.footer}>
            <Link href="/reset-password" className={styles.link}>
              Request a new reset link
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Set new password</h1>
        <p className={styles.subtitle}>Enter your new password below</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          {success && (
            <div className={styles.success} role="status">
              {success}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              New password
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button
            className={styles.button}
            type="submit"
            disabled={submitting || !!success}
          >
            {submitting ? "Resetting..." : "Reset password"}
          </button>
        </form>

        <p className={styles.footer}>
          <Link href="/login" className={styles.link}>
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetConfirmPage() {
  return (
    <Suspense>
      <ResetConfirmForm />
    </Suspense>
  );
}

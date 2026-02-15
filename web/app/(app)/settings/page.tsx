"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { logError } from "@/lib/logging";
import styles from "./settings.module.css";

interface AutoDetectedCycle {
  type: "weekly" | "fortnightly" | "twice_monthly" | "monthly";
  payDays: number[];
}

interface UserSettings {
  email: string;
  contributionCycleType: "weekly" | "fortnightly" | "twice_monthly" | "monthly" | null;
  contributionPayDays: number[];
  currencySymbol: string;
  maxContributionPerCycle: number | null;
  autoDetectedCycle: AutoDetectedCycle;
}

const CYCLE_OPTIONS: { value: string; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "twice_monthly", label: "Twice monthly" },
  { value: "monthly", label: "Monthly" },
];

const CURRENCY_QUICK_PICKS = ["$", "\u00a3", "\u20ac", "\u00a5", "A$", "NZ$"];

function cycleLabel(type: string): string {
  return CYCLE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Change email form state
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Budget preferences form state
  const [budgetError, setBudgetError] = useState("");
  const [budgetSuccess, setBudgetSuccess] = useState("");
  const [budgetSubmitting, setBudgetSubmitting] = useState(false);

  // Account section state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/user/settings");
      if (!res.ok) {
        setError("Failed to load settings");
        return;
      }
      const data = (await res.json()) as UserSettings;
      setSettings(data);
    } catch (err) {
      logError("failed to fetch settings", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

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
      setSettings((prev) => (prev ? { ...prev, email: data.email } : prev));
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

  async function handleBudgetSave(field: string, value: unknown) {
    setBudgetError("");
    setBudgetSuccess("");
    setBudgetSubmitting(true);

    try {
      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setBudgetError(data.error || "Failed to save");
        return;
      }

      const data = (await res.json()) as {
        contributionCycleType: UserSettings["contributionCycleType"];
        contributionPayDays: number[];
        currencySymbol: string;
        maxContributionPerCycle: number | null;
      };
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              contributionCycleType: data.contributionCycleType,
              contributionPayDays: data.contributionPayDays,
              currencySymbol: data.currencySymbol,
              maxContributionPerCycle: data.maxContributionPerCycle,
            }
          : prev,
      );
      setBudgetSuccess("Saved");
    } catch (err) {
      logError("failed to save budget setting", err);
      setBudgetError("Failed to save");
    } finally {
      setBudgetSubmitting(false);
    }
  }

  function handleCycleChange(value: string) {
    if (value === "auto") {
      void handleBudgetSave("contributionCycleType", null);
    } else {
      void handleBudgetSave("contributionCycleType", value);
    }
  }

  function handleCurrencyPick(symbol: string) {
    void handleBudgetSave("currencySymbol", symbol);
  }

  function handleCurrencyInput(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("currency-custom") as HTMLInputElement;
    const value = input.value.trim();
    if (value) {
      void handleBudgetSave("currencySymbol", value);
    }
  }

  function handleMaxContributionSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("max-contribution") as HTMLInputElement;
    const value = input.value.trim();
    if (value === "") {
      void handleBudgetSave("maxContributionPerCycle", null);
    } else {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        setBudgetError("Max contribution must be a positive number");
        return;
      }
      void handleBudgetSave("maxContributionPerCycle", num);
    }
  }

  async function handleExport() {
    setExportError("");
    setExporting(true);
    try {
      const res = await fetch("/api/user/export", { method: "POST" });
      if (!res.ok) {
        setExportError("Failed to export data");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      logError("failed to export data", err);
      setExportError("Failed to export data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDeleteError("");

    if (deleteConfirmation !== "DELETE") {
      setDeleteError("You must type DELETE to confirm");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setDeleteError(data.error || "Failed to delete account");
        return;
      }

      router.push("/");
    } catch (err) {
      logError("failed to delete account", err);
      setDeleteError("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  const activeCycle = settings?.contributionCycleType ?? "auto";

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {loading && <div className={styles.loading}>Loading...</div>}

        {!loading && settings && (
          <>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Profile</h2>

              <div className={styles.emailDisplay}>
                Email: <span className={styles.emailValue}>{settings.email}</span>
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
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Budget Preferences</h2>

              {budgetError && (
                <div className={styles.formError} role="alert">
                  {budgetError}
                </div>
              )}

              {budgetSuccess && (
                <div className={styles.formSuccess} role="status">
                  {budgetSuccess}
                </div>
              )}

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Contribution Cycle</h3>

                {settings.autoDetectedCycle && (
                  <p className={styles.recommendation}>
                    Recommended: <strong>{cycleLabel(settings.autoDetectedCycle.type)}</strong> (based on your income sources)
                  </p>
                )}

                <div className={styles.cycleOptions} role="radiogroup" aria-label="Contribution cycle">
                  <label
                    className={`${styles.cycleOption} ${activeCycle === "auto" ? styles.cycleOptionActive : ""}`}
                  >
                    <input
                      type="radio"
                      name="cycle"
                      value="auto"
                      checked={activeCycle === "auto"}
                      onChange={() => handleCycleChange("auto")}
                      disabled={budgetSubmitting}
                      className={styles.radioInput}
                    />
                    Auto-detect
                  </label>
                  {CYCLE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`${styles.cycleOption} ${activeCycle === opt.value ? styles.cycleOptionActive : ""}`}
                    >
                      <input
                        type="radio"
                        name="cycle"
                        value={opt.value}
                        checked={activeCycle === opt.value}
                        onChange={() => handleCycleChange(opt.value)}
                        disabled={budgetSubmitting}
                        className={styles.radioInput}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Currency Symbol</h3>

                <div className={styles.currencyPicks}>
                  {CURRENCY_QUICK_PICKS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      className={`${styles.currencyPick} ${settings.currencySymbol === sym ? styles.currencyPickActive : ""}`}
                      onClick={() => handleCurrencyPick(sym)}
                      disabled={budgetSubmitting}
                    >
                      {sym}
                    </button>
                  ))}
                </div>

                <form
                  className={styles.inlineForm}
                  onSubmit={(e) => handleCurrencyInput(e)}
                >
                  <input
                    id="currency-custom"
                    name="currency-custom"
                    className={styles.input}
                    type="text"
                    defaultValue={
                      CURRENCY_QUICK_PICKS.includes(settings.currencySymbol)
                        ? ""
                        : settings.currencySymbol
                    }
                    placeholder="Custom symbol"
                    maxLength={5}
                  />
                  <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={budgetSubmitting}
                  >
                    Set
                  </button>
                </form>
              </div>

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Max Contribution Per Cycle</h3>
                <p className={styles.hint}>
                  Optional cap on how much to set aside each cycle. Leave empty for no limit.
                </p>

                <form
                  className={styles.inlineForm}
                  onSubmit={(e) => handleMaxContributionSubmit(e)}
                >
                  <input
                    id="max-contribution"
                    name="max-contribution"
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={
                      settings.maxContributionPerCycle != null
                        ? String(settings.maxContributionPerCycle)
                        : ""
                    }
                    placeholder="No limit"
                  />
                  <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={budgetSubmitting}
                  >
                    Save
                  </button>
                  {settings.maxContributionPerCycle != null && (
                    <button
                      type="button"
                      className={styles.clearButton}
                      onClick={() => void handleBudgetSave("maxContributionPerCycle", null)}
                      disabled={budgetSubmitting}
                    >
                      Clear
                    </button>
                  )}
                </form>
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Account</h2>

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Export Data</h3>
                <p className={styles.hint}>
                  Download all your data as CSV files in a zip archive.
                </p>

                {exportError && (
                  <div className={styles.formError} role="alert">
                    {exportError}
                  </div>
                )}

                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={() => void handleExport()}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "Export Data"}
                </button>
              </div>

              <div className={styles.form}>
                <h3 className={styles.formTitle}>Delete Account</h3>
                <p className={styles.dangerHint}>
                  This will permanently delete your account and all associated data. This action cannot be undone.
                </p>

                {deleteError && (
                  <div className={styles.formError} role="alert">
                    {deleteError}
                  </div>
                )}

                <form onSubmit={(e) => void handleDeleteAccount(e)}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="delete-confirmation">
                      Type DELETE to confirm
                    </label>
                    <input
                      id="delete-confirmation"
                      className={styles.input}
                      type="text"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>

                  <button
                    type="submit"
                    className={styles.dangerButton}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Delete Account"}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

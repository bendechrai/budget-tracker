"use client";

import { useState, useEffect, useCallback } from "react";
import { logError } from "@/lib/logging";
import styles from "./settings.module.css";
import CollapsibleSection from "./CollapsibleSection";
import ProfileSection from "./ProfileSection";
import BudgetPreferencesSection from "./BudgetPreferencesSection";
import FundsSection from "./FundsSection";
import AccountSection from "./AccountSection";

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

type SectionName = "Profile" | "Budget Preferences" | "Funds" | "Account";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openSection, setOpenSection] = useState<SectionName | null>("Profile");

  function toggleSection(section: SectionName) {
    setOpenSection((prev) => (prev === section ? null : section));
  }

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
            <CollapsibleSection title="Profile" expanded={openSection === "Profile"} onToggle={() => toggleSection("Profile")}>
              <ProfileSection
                email={settings.email}
                onEmailChange={(newEmail) =>
                  setSettings((prev) => (prev ? { ...prev, email: newEmail } : prev))
                }
              />
            </CollapsibleSection>

            <CollapsibleSection title="Budget Preferences" expanded={openSection === "Budget Preferences"} onToggle={() => toggleSection("Budget Preferences")}>
              <BudgetPreferencesSection
                contributionCycleType={settings.contributionCycleType}
                contributionPayDays={settings.contributionPayDays}
                currencySymbol={settings.currencySymbol}
                maxContributionPerCycle={settings.maxContributionPerCycle}
                autoDetectedCycle={settings.autoDetectedCycle}
                onSettingsChange={(updated) =>
                  setSettings((prev) =>
                    prev
                      ? {
                          ...prev,
                          contributionCycleType: updated.contributionCycleType,
                          contributionPayDays: updated.contributionPayDays,
                          currencySymbol: updated.currencySymbol,
                          maxContributionPerCycle: updated.maxContributionPerCycle,
                        }
                      : prev
                  )
                }
              />
            </CollapsibleSection>

            <CollapsibleSection title="Funds" expanded={openSection === "Funds"} onToggle={() => toggleSection("Funds")}>
              <FundsSection />
            </CollapsibleSection>

            <CollapsibleSection title="Account" expanded={openSection === "Account"} onToggle={() => toggleSection("Account")}>
              <AccountSection />
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
}

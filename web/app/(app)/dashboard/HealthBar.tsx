"use client";

import { useState, useEffect } from "react";
import styles from "./health-bar.module.css";
import { logError } from "@/lib/logging";

interface GroupBreakdown {
  name: string;
  funded: number;
  required: number;
}

interface ObligationWithBalance {
  id: string;
  name: string;
  amount: number;
  fundGroupId: string | null;
  fundGroup: { id: string; name: string } | null;
  fundBalance: { currentBalance: number } | null;
}

interface HealthBarProps {
  totalFunded: number;
  totalRequired: number;
}

function getColor(percentage: number): "green" | "amber" | "red" {
  if (percentage >= 90) return "green";
  if (percentage >= 60) return "amber";
  return "red";
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function HealthBar({ totalFunded, totalRequired }: HealthBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [groups, setGroups] = useState<GroupBreakdown[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const percentage = totalRequired > 0 ? (totalFunded / totalRequired) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);
  const color = getColor(percentage);

  useEffect(() => {
    if (!expanded) return;
    if (groups.length > 0) return;

    async function fetchGroupBreakdown() {
      setLoadingGroups(true);
      try {
        const res = await fetch("/api/obligations");
        if (!res.ok) return;
        const obligations = (await res.json()) as ObligationWithBalance[];

        const groupMap = new Map<string, GroupBreakdown>();

        for (const ob of obligations) {
          const groupName = ob.fundGroup?.name ?? "Ungrouped";
          const existing = groupMap.get(groupName);
          const balance = ob.fundBalance?.currentBalance ?? 0;
          const required = ob.amount;

          if (existing) {
            existing.funded += balance;
            existing.required += required;
          } else {
            groupMap.set(groupName, {
              name: groupName,
              funded: balance,
              required,
            });
          }
        }

        setGroups(Array.from(groupMap.values()));
      } catch (err) {
        logError("failed to fetch group breakdown", err);
      } finally {
        setLoadingGroups(false);
      }
    }

    void fetchGroupBreakdown();
  }, [expanded, groups.length]);

  return (
    <div className={styles.healthBar}>
      <button
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        type="button"
      >
        <div className={styles.labels}>
          <span className={styles.labelText}>Fund health</span>
          <span className={styles.amounts}>
            {formatCurrency(totalFunded)} of {formatCurrency(totalRequired)} set aside
          </span>
        </div>
        <span className={styles.expandIcon} aria-hidden="true">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      <div className={styles.trackContainer}>
        <div className={styles.track}>
          <div
            className={`${styles.fill} ${styles[color]}`}
            style={{ width: `${clampedPercentage}%` }}
            role="progressbar"
            aria-valuenow={Math.round(percentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(percentage)}% funded`}
          />
        </div>
        <span className={`${styles.percentageLabel} ${styles[color]}`}>
          {Math.round(percentage)}%
        </span>
      </div>

      {expanded && (
        <div className={styles.breakdown}>
          {loadingGroups && (
            <p className={styles.loadingGroups}>Loading breakdown...</p>
          )}
          {!loadingGroups && groups.length === 0 && (
            <p className={styles.noGroups}>No obligations to break down</p>
          )}
          {!loadingGroups &&
            groups.map((group) => {
              const groupPct =
                group.required > 0
                  ? (group.funded / group.required) * 100
                  : 0;
              const groupColor = getColor(groupPct);
              return (
                <div key={group.name} className={styles.groupRow}>
                  <div className={styles.groupInfo}>
                    <span className={styles.groupName}>{group.name}</span>
                    <span className={styles.groupAmounts}>
                      {formatCurrency(group.funded)} / {formatCurrency(group.required)}
                    </span>
                  </div>
                  <div className={styles.groupTrack}>
                    <div
                      className={`${styles.groupFill} ${styles[groupColor]}`}
                      style={{ width: `${Math.min(groupPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

"use client";

import styles from "./health-bar.module.css";

export interface FundGroupHealth {
  id: string;
  name: string;
  funded: number;
  required: number;
}

interface HealthBarProps {
  fundGroups: FundGroupHealth[];
}

function getColor(percentage: number): "green" | "amber" | "red" {
  if (percentage >= 90) return "green";
  if (percentage >= 60) return "amber";
  return "red";
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function HealthBar({ fundGroups }: HealthBarProps) {
  if (fundGroups.length === 0) {
    return null;
  }

  return (
    <div className={styles.healthBar}>
      <div className={styles.header}>
        <span className={styles.labelText}>Fund health</span>
      </div>
      <div className={styles.funds}>
        {fundGroups.map((fg) => {
          const percentage =
            fg.required > 0 ? (fg.funded / fg.required) * 100 : 0;
          const clampedPercentage = Math.min(percentage, 100);
          const color = getColor(percentage);
          return (
            <div key={fg.id} className={styles.fundRow}>
              <div className={styles.fundInfo}>
                <span className={styles.fundName}>{fg.name}</span>
                <span className={styles.fundAmounts}>
                  {formatCurrency(fg.funded)} / {formatCurrency(fg.required)}
                </span>
              </div>
              <div className={styles.trackContainer}>
                <div className={styles.track}>
                  <div
                    className={`${styles.fill} ${styles[color]}`}
                    style={{ width: `${clampedPercentage}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(percentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${fg.name} ${Math.round(percentage)}% funded`}
                  />
                </div>
                <span className={`${styles.percentageLabel} ${styles[color]}`}>
                  {Math.round(percentage)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

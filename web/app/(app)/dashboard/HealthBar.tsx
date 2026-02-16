"use client";

import styles from "./health-bar.module.css";

export interface FundGroupHealth {
  id: string;
  name: string;
  funded: number;
  monthlyRequired: number;
  preseed: number;
}

interface HealthBarProps {
  fundGroups: FundGroupHealth[];
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
          const target = fg.preseed + fg.monthlyRequired;
          const percentage = target > 0 ? (fg.funded / target) * 100 : 0;
          const fillPct = Math.min(percentage, 100);
          const thresholdPct = target > 0 ? (fg.preseed / target) * 100 : 0;
          const color = fg.funded >= fg.preseed ? "green" : "yellow";
          const hasThreshold = fg.preseed > 0;

          return (
            <div key={fg.id} className={styles.fundRow}>
              <div className={styles.fundInfo}>
                <span className={styles.fundName}>{fg.name}</span>
                <span className={styles.fundAmounts}>
                  {formatCurrency(fg.funded)} / {formatCurrency(target)}
                </span>
              </div>
              <div className={styles.trackContainer}>
                <div className={`${styles.trackWrapper} ${hasThreshold ? styles.trackWrapperWithLabel : ""}`}>
                  <div className={styles.track}>
                    <div
                      className={`${styles.fill} ${styles[color]}`}
                      style={{ width: `${fillPct}%` }}
                    />
                    <div
                      role="progressbar"
                      aria-valuenow={Math.round(percentage)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${fg.name} ${Math.round(percentage)}% funded`}
                      style={{ display: "none" }}
                    />
                  </div>
                  {hasThreshold && (
                    <div
                      className={styles.threshold}
                      style={{ left: `${thresholdPct}%` }}
                      data-testid={`threshold-${fg.id}`}
                    >
                      <span className={styles.thresholdLabel}>
                        ${Math.round(fg.preseed)}
                      </span>
                    </div>
                  )}
                </div>
                <span className={styles.percentageLabel}>
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

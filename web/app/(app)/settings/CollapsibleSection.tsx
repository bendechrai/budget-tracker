"use client";

import type { ReactNode } from "react";
import styles from "./settings.module.css";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
}

export default function CollapsibleSection({
  title,
  children,
  expanded,
  onToggle,
}: CollapsibleSectionProps) {
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`}>
          &#9662;
        </span>
      </button>
      {expanded && <div className={styles.sectionContent}>{children}</div>}
    </div>
  );
}

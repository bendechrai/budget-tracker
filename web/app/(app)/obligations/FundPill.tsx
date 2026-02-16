"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./obligations.module.css";

interface FundGroup {
  id: string;
  name: string;
}

interface FundPillProps {
  obligationId: string;
  currentFundId: string;
  currentFundName: string;
  allFunds: FundGroup[];
  onMoveFund: (obligationId: string, newFundGroupId: string) => void;
}

export default function FundPill({
  obligationId,
  currentFundId,
  currentFundName,
  allFunds,
  onMoveFund,
}: FundPillProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isInteractive = allFunds.length > 1;
  const otherFunds = allFunds.filter((f) => f.id !== currentFundId);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!isInteractive) {
    return (
      <div className={styles.fundPillWrapper}>
        <span
          className={`${styles.fundPill} ${styles.fundPillStatic}`}
          data-testid={`fund-pill-${obligationId}`}
        >
          {currentFundName}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.fundPillWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.fundPill}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={`fund-pill-${obligationId}`}
      >
        {currentFundName}
      </button>
      {open && (
        <ul
          className={styles.fundDropdown}
          role="listbox"
          data-testid={`fund-dropdown-${obligationId}`}
        >
          {otherFunds.map((fund) => (
            <li
              key={fund.id}
              role="option"
              aria-selected={false}
              className={styles.fundDropdownItem}
              onClick={() => {
                onMoveFund(obligationId, fund.id);
                setOpen(false);
              }}
              data-testid={`fund-option-${fund.id}`}
            >
              {fund.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

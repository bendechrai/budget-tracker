"use client";

import styles from "./error.module.css";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Something went wrong</h1>
      <button className={styles.button} onClick={reset}>
        Try again
      </button>
    </div>
  );
}

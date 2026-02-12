import Link from "next/link";
import styles from "./onboarding.module.css";

export default function OnboardingWelcomePage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Welcome to Sinking Fund</h1>
        <p className={styles.subtitle}>
          A sinking fund is money you set aside regularly so that when bills,
          subscriptions, and big expenses come due, the money is already there.
          No more scrambling — just steady, predictable saving.
        </p>

        <p className={styles.prompt}>
          Let&apos;s get started. How would you like to set up your income and
          expenses?
        </p>

        <div className={styles.paths}>
          <Link href="/onboarding/upload" className={styles.pathCard}>
            <span className={styles.pathIcon}>📄</span>
            <span className={styles.pathTitle}>Upload Statements</span>
            <span className={styles.pathDescription}>
              Upload your bank statements and we&apos;ll detect your recurring
              income and expenses automatically.
            </span>
          </Link>

          <Link href="/onboarding/manual/income" className={styles.pathCard}>
            <span className={styles.pathIcon}>✏️</span>
            <span className={styles.pathTitle}>Manual Entry</span>
            <span className={styles.pathDescription}>
              Add your income sources and expenses one at a time using simple
              forms.
            </span>
          </Link>
        </div>

        <Link href="/onboarding/fund-setup" className={styles.skipLink}>
          Skip for now — I&apos;ll add these later
        </Link>
      </div>
    </div>
  );
}

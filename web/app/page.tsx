import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Sinking Fund</h1>
        <p className={styles.subtitle}>
          Take control of your finances. Track income, manage obligations, and
          build your sinking fund so you&#39;re never caught off guard.
        </p>
        <div className={styles.ctas}>
          <Link href="/signup" className={styles.primary}>
            Sign up
          </Link>
          <Link href="/login" className={styles.secondary}>
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}

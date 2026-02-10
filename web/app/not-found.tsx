import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <h1 className={styles.code}>404</h1>
      <p className={styles.message}>This page could not be found.</p>
      <Link href="/" className={styles.link}>
        Go home
      </Link>
    </div>
  );
}

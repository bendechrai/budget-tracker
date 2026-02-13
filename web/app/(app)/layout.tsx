import { ReactNode } from "react";
import Nav from "@/app/components/Nav";
import LogoutButton from "./LogoutButton";
import styles from "./layout.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.navWrapper}>
          <Nav />
        </div>
        <div className={styles.logoutWrapper}>
          <LogoutButton />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

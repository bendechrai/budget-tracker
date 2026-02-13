"use client";

import { useRouter } from "next/navigation";
import { logError } from "@/lib/logging";
import styles from "./layout.module.css";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
      }
    } catch (err) {
      logError("logout failed", err);
    }
  }

  return (
    <button
      className={styles.logoutButton}
      onClick={() => void handleLogout()}
      type="button"
    >
      Log out
    </button>
  );
}

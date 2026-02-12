"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./nav.module.css";
import { logError } from "@/lib/logging";

export default function Nav() {
  const pathname = usePathname();
  const [suggestionsCount, setSuggestionsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      try {
        const res = await fetch("/api/suggestions");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { count: number };
        if (!cancelled) {
          setSuggestionsCount(data.count);
        }
      } catch (err) {
        logError("failed to fetch suggestions count", err);
      }
    }

    void loadCount();

    return () => {
      cancelled = true;
    };
  }, []);

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/income", label: "Income" },
    { href: "/obligations", label: "Obligations" },
    { href: "/import", label: "Import" },
    { href: "/transactions", label: "Transactions" },
    { href: "/suggestions", label: "Suggestions" },
  ];

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <ul className={styles.navList}>
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <li key={link.href} className={styles.navItem}>
              <Link
                href={link.href}
                className={`${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
                {link.href === "/suggestions" && suggestionsCount > 0 && (
                  <span className={styles.badge} aria-label={`${suggestionsCount} pending suggestions`}>
                    {suggestionsCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./nav.module.css";
import { useSuggestionsCount } from "@/app/contexts/SuggestionsCountContext";

export default function Nav() {
  const pathname = usePathname();
  const { count: suggestionsCount } = useSuggestionsCount();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/income", label: "Income" },
    { href: "/obligations", label: "Obligations" },
    { href: "/import", label: "Import" },
    { href: "/transactions", label: "Transactions" },
    { href: "/suggestions", label: "Suggestions" },
  ];

  return (
    <nav className={styles.nav} aria-label="Main navigation" data-testid="nav">
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

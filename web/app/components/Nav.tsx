"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  DollarSign,
  CalendarCheck,
  ArrowLeftRight,
  Menu,
  X,
  Upload,
  Lightbulb,
  Settings,
  LogOut,
} from "lucide-react";
import styles from "./nav.module.css";
import { useSuggestionsCount } from "@/app/contexts/SuggestionsCountContext";
import { logError } from "@/lib/logging";

const allLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/income", label: "Income" },
  { href: "/obligations", label: "Obligations" },
  { href: "/import", label: "Import" },
  { href: "/transactions", label: "Transactions" },
  { href: "/suggestions", label: "Suggestions" },
  { href: "/settings", label: "Settings" },
];

const tabLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/income", label: "Income", icon: DollarSign },
  { href: "/obligations", label: "Bills", icon: CalendarCheck },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
];

const moreLinks = [
  { href: "/import", label: "Import", icon: Upload },
  { href: "/suggestions", label: "Suggestions", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface NavProps {
  mobile?: boolean;
}

export default function Nav({ mobile }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { count: suggestionsCount } = useSuggestionsCount();
  const [moreOpen, setMoreOpen] = useState(false);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(href + "/"),
    [pathname]
  );

  const isMoreActive = moreLinks.some((l) => isActive(l.href));

  async function handleLogout() {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/");
      }
    } catch (err) {
      logError("logout failed", err);
    }
  }

  if (mobile) {
    return (
      <>
        {/* Mobile: bottom tab bar */}
        <nav className={styles.bottomBar} aria-label="Mobile navigation" data-testid="mobile-nav">
          {tabLinks.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.tabItem}${active ? ` ${styles.tabItemActive}` : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                <span className={styles.tabLabel}>{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className={`${styles.tabItem}${isMoreActive ? ` ${styles.tabItemActive}` : ""}${moreOpen ? ` ${styles.tabItemActive}` : ""}`}
            onClick={() => setMoreOpen((prev) => !prev)}
            aria-expanded={moreOpen}
            aria-label="More navigation options"
          >
            {moreOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={1.8} />}
            <span className={styles.tabLabel}>More</span>
            {!moreOpen && suggestionsCount > 0 && (
              <span className={styles.tabBadge} aria-label={`${suggestionsCount} pending`} />
            )}
          </button>
        </nav>

        {/* More sheet overlay */}
        {moreOpen && (
          <>
            <div
              className={styles.moreOverlay}
              onClick={() => setMoreOpen(false)}
              role="presentation"
            />
            <div className={styles.moreSheet} role="dialog" aria-label="More options">
              {moreLinks.map((link) => {
                const active = isActive(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`${styles.moreItem}${active ? ` ${styles.moreItemActive}` : ""}`}
                    onClick={closeMore}
                  >
                    <Icon size={20} strokeWidth={1.8} />
                    <span>{link.label}</span>
                    {link.href === "/suggestions" && suggestionsCount > 0 && (
                      <span className={styles.badge}>{suggestionsCount}</span>
                    )}
                  </Link>
                );
              })}
              <button
                type="button"
                className={styles.moreItem}
                onClick={() => void handleLogout()}
              >
                <LogOut size={20} strokeWidth={1.8} />
                <span>Log out</span>
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <nav className={styles.nav} aria-label="Main navigation" data-testid="nav">
      <ul className={styles.navList}>
        {allLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <li key={link.href} className={styles.navItem}>
              <Link
                href={link.href}
                className={`${styles.navLink}${active ? ` ${styles.navLinkActive}` : ""}`}
                aria-current={active ? "page" : undefined}
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

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ObligationForm from "../ObligationForm";
import type { ObligationFormData } from "../ObligationForm";
import styles from "../obligations.module.css";
import { logError } from "@/lib/logging";

interface FundGroup {
  id: string;
  name: string;
}

export default function NewObligationPage() {
  const router = useRouter();
  const [fundGroups, setFundGroups] = useState<FundGroup[]>([]);

  useEffect(() => {
    async function fetchFundGroups() {
      try {
        const res = await fetch("/api/fund-groups");
        if (res.ok) {
          const data = (await res.json()) as FundGroup[];
          setFundGroups(data);
        }
      } catch (err) {
        logError("failed to fetch fund groups", err);
      }
    }
    void fetchFundGroups();
  }, []);

  async function handleSubmit(data: ObligationFormData) {
    const res = await fetch("/api/obligations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to create obligation");
    }

    router.push("/obligations");
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/obligations" className={styles.backLink}>← Back</Link>
        <h1 className={styles.title}>Add Obligation</h1>
        <ObligationForm
          fundGroups={fundGroups}
          onSubmit={handleSubmit}
          submitLabel="Add Obligation"
        />
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ObligationForm from "../../ObligationForm";
import type { ObligationFormData } from "../../ObligationForm";
import ContributionHistory from "../../ContributionHistory";
import styles from "../../obligations.module.css";
import { logError } from "@/lib/logging";

interface FundGroup {
  id: string;
  name: string;
}

interface CustomScheduleEntry {
  id: string;
  dueDate: string;
  amount: number;
  isPaid: boolean;
}

interface ObligationResponse {
  id: string;
  name: string;
  type: string;
  amount: number;
  frequency: string | null;
  frequencyDays: number | null;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  fundGroupId: string | null;
  customEntries: CustomScheduleEntry[];
}

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toISOString().split("T")[0];
}

export default function EditObligationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [obligation, setObligation] = useState<ObligationResponse | null>(
    null
  );
  const [fundGroups, setFundGroups] = useState<FundGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      try {
        const [obligationsRes, fundGroupsRes] = await Promise.all([
          fetch("/api/obligations"),
          fetch("/api/fund-groups"),
        ]);

        if (!obligationsRes.ok) {
          setError("Failed to load obligation");
          return;
        }

        const obligations =
          (await obligationsRes.json()) as ObligationResponse[];
        const found = obligations.find((o) => o.id === id);
        if (!found) {
          setError("Obligation not found");
          return;
        }
        setObligation(found);

        if (fundGroupsRes.ok) {
          const groups = (await fundGroupsRes.json()) as FundGroup[];
          setFundGroups(groups);
        }
      } catch (err) {
        logError("failed to fetch obligation", err);
        setError("Failed to load obligation");
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [id]);

  async function handleSubmit(data: ObligationFormData) {
    if (!id) return;

    const res = await fetch(`/api/obligations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to update obligation");
    }

    router.push("/obligations");
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.loading}>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.error} role="alert">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/obligations" className={styles.backLink}>← Back</Link>
        <h1 className={styles.title}>Edit Obligation</h1>
        {obligation && (
          <>
            <ObligationForm
              initialData={{
                name: obligation.name,
                type: obligation.type,
                amount: obligation.amount,
                frequency: obligation.frequency,
                frequencyDays: obligation.frequencyDays,
                startDate: formatDateForInput(obligation.startDate),
                endDate: formatDateForInput(obligation.endDate),
                nextDueDate: formatDateForInput(obligation.nextDueDate),
                fundGroupId: obligation.fundGroupId,
                customEntries: obligation.customEntries.map((e) => ({
                  dueDate: formatDateForInput(e.dueDate),
                  amount: e.amount,
                })),
              }}
              fundGroups={fundGroups}
              onSubmit={handleSubmit}
              submitLabel="Save Changes"
            />
            <ContributionHistory obligationId={obligation.id} />
          </>
        )}
      </div>
    </div>
  );
}

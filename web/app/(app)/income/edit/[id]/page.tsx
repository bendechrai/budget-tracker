"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import IncomeForm from "../../IncomeForm";
import type { IncomeFormData } from "../../IncomeForm";
import styles from "../../income.module.css";
import { logError } from "@/lib/logging";

interface IncomeSourceResponse {
  id: string;
  name: string;
  expectedAmount: number;
  frequency: string;
  frequencyDays: number | null;
  isIrregular: boolean;
  minimumExpected: number | null;
  nextExpectedDate: string | null;
}

function formatDateForInput(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toISOString().split("T")[0];
}

export default function EditIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [incomeSource, setIncomeSource] =
    useState<IncomeSourceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    async function fetchIncomeSource() {
      try {
        const res = await fetch("/api/income-sources");
        if (!res.ok) {
          setError("Failed to load income source");
          return;
        }
        const sources = (await res.json()) as IncomeSourceResponse[];
        const source = sources.find((s) => s.id === id);
        if (!source) {
          setError("Income source not found");
          return;
        }
        setIncomeSource(source);
      } catch (err) {
        logError("failed to fetch income source", err);
        setError("Failed to load income source");
      } finally {
        setLoading(false);
      }
    }

    void fetchIncomeSource();
  }, [id]);

  async function handleSubmit(data: IncomeFormData) {
    if (!id) return;

    const res = await fetch(`/api/income-sources/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to update income source");
    }

    router.push("/income");
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
        <Link href="/income" className={styles.backLink}>← Back</Link>
        <h1 className={styles.title}>Edit Income Source</h1>
        {incomeSource && (
          <IncomeForm
            initialData={{
              name: incomeSource.name,
              expectedAmount: incomeSource.expectedAmount,
              frequency: incomeSource.frequency,
              frequencyDays: incomeSource.frequencyDays,
              isIrregular: incomeSource.isIrregular,
              minimumExpected: incomeSource.minimumExpected,
              nextExpectedDate: formatDateForInput(
                incomeSource.nextExpectedDate
              ),
            }}
            onSubmit={handleSubmit}
            submitLabel="Save Changes"
          />
        )}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import IncomeForm from "../IncomeForm";
import type { IncomeFormData } from "../IncomeForm";
import styles from "../income.module.css";

export default function NewIncomePage() {
  const router = useRouter();

  async function handleSubmit(data: IncomeFormData) {
    const res = await fetch("/api/income-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? "Failed to create income source");
    }

    router.push("/income");
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/income" className={styles.backLink}>← Back</Link>
        <h1 className={styles.title}>Add Income Source</h1>
        <IncomeForm onSubmit={handleSubmit} submitLabel="Add Income Source" />
      </div>
    </div>
  );
}

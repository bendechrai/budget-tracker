"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./transactions.module.css";
import { logError } from "@/lib/logging";

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TransactionsResponse {
  transactions: Transaction[];
  pagination: Pagination;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [page, setPage] = useState(1);

  const fetchTransactions = useCallback(async (currentPage: number, filterStart: string, filterEnd: string) => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      if (filterStart) {
        params.set("startDate", filterStart);
      }
      if (filterEnd) {
        params.set("endDate", filterEnd);
      }

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) {
        setError("Failed to load transactions");
        return;
      }

      const data = (await res.json()) as TransactionsResponse;
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) {
      logError("failed to fetch transactions", err);
      setError("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTransactions(page, appliedStartDate, appliedEndDate);
  }, [fetchTransactions, page, appliedStartDate, appliedEndDate]);

  function handleFilter() {
    setPage(1);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  }

  function handleClearFilter() {
    setStartDate("");
    setEndDate("");
    setPage(1);
    setAppliedStartDate("");
    setAppliedEndDate("");
  }

  function handlePreviousPage() {
    setPage((p) => Math.max(1, p - 1));
  }

  function handleNextPage() {
    if (pagination) {
      setPage((p) => Math.min(pagination.totalPages, p + 1));
    }
  }

  const hasFilter = appliedStartDate || appliedEndDate;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Transactions</h1>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="startDate">
              From
            </label>
            <input
              id="startDate"
              type="date"
              className={styles.filterInput}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="endDate">
              To
            </label>
            <input
              id="endDate"
              type="date"
              className={styles.filterInput}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={styles.filterButton}
            onClick={handleFilter}
          >
            Filter
          </button>
          {hasFilter && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClearFilter}
            >
              Clear
            </button>
          )}
        </div>

        {loading && <p className={styles.loading}>Loading...</p>}

        {!loading && transactions.length === 0 && !error && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No transactions found</h2>
            <p className={styles.emptyDescription}>
              {hasFilter
                ? "No transactions match your date filter. Try adjusting the range."
                : "Import a bank statement to see your transactions here."}
            </p>
          </div>
        )}

        {!loading && transactions.length > 0 && (
          <>
            <ul className={styles.list}>
              {transactions.map((tx) => (
                <li key={tx.id} className={styles.listItem}>
                  <div className={styles.listItemInfo}>
                    <span className={styles.listItemDescription}>
                      {tx.description}
                    </span>
                    <span className={styles.listItemDetail}>
                      {formatDate(tx.date)} &middot; {tx.type}
                    </span>
                  </div>
                  <span
                    className={`${styles.listItemAmount} ${tx.type === "credit" ? styles.credit : styles.debit}`}
                  >
                    {tx.type === "credit" ? "+" : "-"}
                    {formatAmount(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>

            {pagination && pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={handlePreviousPage}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className={styles.paginationInfo}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={handleNextPage}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

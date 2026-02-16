"use client";

import { useState, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { logError } from "@/lib/logging";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import ContributionHistory from "./ContributionHistory";
import styles from "./settings.module.css";

interface FundGroup {
  id: string;
  name: string;
  isDefault: boolean;
  _count: { obligations: number };
}

export default function FundsSection() {
  const [groups, setGroups] = useState<FundGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/fund-groups");
      if (!res.ok) {
        setError("Failed to load fund groups");
        return;
      }
      const data = (await res.json()) as FundGroup[];
      setGroups(data);
    } catch (err) {
      logError("failed to fetch fund groups", err);
      setError("Failed to load fund groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/fund-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to create fund group");
        return;
      }

      const created = (await res.json()) as FundGroup;
      setGroups((prev) => [...prev, { ...created, _count: created._count ?? { obligations: 0 } }]);
      setNewName("");
    } catch (err) {
      logError("failed to create fund group", err);
      setError("Failed to create fund group");
    } finally {
      setCreating(false);
    }
  }

  function startRename(group: FundGroup) {
    setEditingId(group.id);
    setEditName(group.name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditName("");
  }

  async function submitRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }

    setError("");
    try {
      const res = await fetch(`/api/fund-groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to rename fund group");
        return;
      }

      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, name: trimmed } : g))
      );
    } catch (err) {
      logError("failed to rename fund group", err);
      setError("Failed to rename fund group");
    } finally {
      setEditingId(null);
      setEditName("");
    }
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>, id: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submitRename(id);
    } else if (e.key === "Escape") {
      cancelRename();
    }
  }

  async function handleDelete(group: FundGroup) {
    const ok = await confirm({
      title: "Delete fund group",
      message: `Are you sure you want to delete "${group.name}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setError("");
    try {
      const res = await fetch(`/api/fund-groups/${group.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to delete fund group");
        return;
      }

      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (err) {
      logError("failed to delete fund group", err);
      setError("Failed to delete fund group");
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <>
      {confirmDialog}

      {error && (
        <div className={styles.formError} role="alert">
          {error}
        </div>
      )}

      {groups.length > 0 && (
        <div className={styles.fundList}>
          {groups.map((group) => (
            <div key={group.id} className={styles.fundGroupEntry}>
              <div className={styles.fundItem}>
                <div className={styles.fundInfo}>
                  {editingId === group.id ? (
                    <input
                      className={styles.fundRenameInput}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => handleRenameKeyDown(e, group.id)}
                      onBlur={() => void submitRename(group.id)}
                      autoFocus
                      aria-label="Fund group name"
                    />
                  ) : (
                    <>
                      <span className={styles.fundName}>{group.name}</span>
                      {group.isDefault && (
                        <span className={styles.fundBadge}>Default</span>
                      )}
                      <span className={styles.fundMeta}>
                        {group._count.obligations} {group._count.obligations === 1 ? "obligation" : "obligations"}
                      </span>
                    </>
                  )}
                </div>
                <div className={styles.fundActions}>
                  {editingId === group.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.fundActionButton}
                        onClick={() => void submitRename(group.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={styles.fundActionButton}
                        onClick={cancelRename}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.fundActionButton}
                        onClick={() =>
                          setExpandedHistoryId(
                            expandedHistoryId === group.id ? null : group.id
                          )
                        }
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className={styles.fundActionButton}
                        onClick={() => startRename(group)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={styles.fundDeleteButton}
                        onClick={() => void handleDelete(group)}
                        disabled={group.isDefault || group._count.obligations > 0}
                        title={
                          group.isDefault
                            ? "Cannot delete the default group"
                            : group._count.obligations > 0
                              ? "Remove obligations first"
                              : "Delete fund group"
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              {expandedHistoryId === group.id && (
                <div className={styles.fundHistoryPanel}>
                  <ContributionHistory fundGroupId={group.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && (
        <p className={styles.hint}>No fund groups yet. Create one below.</p>
      )}

      <form
        className={styles.fundCreateForm}
        onSubmit={(e) => void handleCreate(e)}
      >
        <input
          className={styles.input}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New fund group name"
          aria-label="New fund group name"
        />
        <button
          type="submit"
          className={styles.submitButton}
          disabled={creating || !newName.trim()}
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </form>
    </>
  );
}

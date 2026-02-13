"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./ai-bar.module.css";
import { logError } from "@/lib/logging";
import type { ParseResult } from "@/lib/ai/types";

interface Position {
  x: number;
  y: number;
}

interface AIResponse {
  intent: ParseResult;
  answer?: string;
}

function formatResponse(data: AIResponse): string {
  const { intent } = data;

  if (intent.type === "query" && data.answer) {
    return data.answer;
  }

  if (intent.type === "clarification") {
    return intent.message;
  }

  if (intent.type === "unrecognized") {
    return intent.message;
  }

  if (intent.type === "create") {
    const target = intent.targetType === "income" ? "income source" : "obligation";
    const name = intent.incomeFields?.name ?? intent.obligationFields?.name ?? "item";
    return `Parsed: Create ${target} "${name}"`;
  }

  if (intent.type === "edit") {
    return `Parsed: Edit "${intent.targetName}"`;
  }

  if (intent.type === "delete") {
    return `Parsed: Delete "${intent.targetName}"`;
  }

  return "Response received";
}

export default function AIBar() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ text: string; isError: boolean } | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    setResponse(null);
  }, []);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string };
        setResponse({ text: errorData.error ?? "Something went wrong", isError: true });
        return;
      }

      const data = (await res.json()) as AIResponse;
      setResponse({ text: formatResponse(data), isError: false });
      setInput("");
    } catch (err) {
      logError("AI bar submit failed", err);
      setResponse({ text: "Failed to process request", isError: true });
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;

      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const currentX = position?.x ?? rect.left;
      const currentY = position?.y ?? rect.top;

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: currentX,
        startPosY: currentY,
      };

      e.preventDefault();
    },
    [position]
  );

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      setPosition({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      });
    }

    function handleMouseUp() {
      dragRef.current = null;
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const wrapperStyle = position
    ? {
        position: "fixed" as const,
        left: position.x,
        top: position.y,
        bottom: "auto",
        right: "auto",
      }
    : undefined;

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      style={wrapperStyle}
      data-testid="ai-bar"
    >
      {!expanded ? (
        <button
          className={styles.pill}
          onClick={handleExpand}
          aria-label="Open AI assistant"
          data-testid="ai-bar-pill"
        >
          AI
        </button>
      ) : (
        <div className={styles.panel} data-testid="ai-bar-panel">
          <div
            className={styles.panelHeader}
            onMouseDown={handleDragStart}
            role="toolbar"
            aria-label="AI assistant header — drag to reposition"
          >
            <span className={styles.panelTitle}>AI Assistant</span>
            <button
              className={styles.closeButton}
              onClick={handleCollapse}
              aria-label="Close AI assistant"
              data-testid="ai-bar-close"
            >
              ×
            </button>
          </div>

          <div className={styles.responseArea} aria-live="polite">
            {loading && (
              <p className={styles.loading}>Processing...</p>
            )}
            {!loading && response && (
              <p
                className={response.isError ? styles.responseError : styles.responseIntent}
                data-testid="ai-bar-response"
              >
                {response.text}
              </p>
            )}
            {!loading && !response && (
              <p className={styles.responseMessage}>
                Type a command like &quot;Add Netflix $22.99 monthly&quot; or ask a question.
              </p>
            )}
          </div>

          <div className={styles.inputArea}>
            <input
              ref={inputRef}
              type="text"
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to do?"
              disabled={loading}
              aria-label="AI assistant input"
              data-testid="ai-bar-input"
            />
            <button
              className={styles.submitButton}
              onClick={() => void handleSubmit()}
              disabled={loading || !input.trim()}
              aria-label="Submit"
              data-testid="ai-bar-submit"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

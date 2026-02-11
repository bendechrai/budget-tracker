import { describe, it, expect, vi, beforeEach } from "vitest";
import { logError } from "../logging";

describe("logError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  it("logs an Error instance with name, message, and stack", () => {
    const err = new Error("something broke");

    logError("Operation failed", err);

    expect(console.error).toHaveBeenCalledWith(
      "[ERROR] Operation failed",
      expect.objectContaining({
        name: "Error",
        message: "something broke",
        stack: expect.any(String),
        timestamp: "2025-01-15T12:00:00.000Z",
      })
    );
  });

  it("logs a non-Error value with a value field", () => {
    logError("Unexpected value", "string error");

    expect(console.error).toHaveBeenCalledWith(
      "[ERROR] Unexpected value",
      expect.objectContaining({
        value: "string error",
        timestamp: "2025-01-15T12:00:00.000Z",
      })
    );
  });

  it("includes context when provided", () => {
    const err = new Error("db failed");

    logError("Query error", err, { userId: "123", query: "SELECT *" });

    expect(console.error).toHaveBeenCalledWith(
      "[ERROR] Query error",
      expect.objectContaining({
        name: "Error",
        message: "db failed",
        context: { userId: "123", query: "SELECT *" },
        timestamp: "2025-01-15T12:00:00.000Z",
      })
    );
  });

  it("omits context key when context is not provided", () => {
    logError("Simple error", new Error("oops"));

    const loggedObject = vi.mocked(console.error).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(loggedObject).not.toHaveProperty("context");
  });
});

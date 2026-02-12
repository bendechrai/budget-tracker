import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindFirst = vi.fn();
const mockCreateMany = vi.fn();
const mockUpdate = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    importLog: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    transaction: {
      createMany: (...args: unknown[]) => mockCreateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

const mockUser = { id: "user_1", email: "test@example.com" };

const mockImportLog = {
  id: "import_1",
  userId: "user_1",
  fileName: "statement.csv",
  format: "csv",
  transactionsFound: 5,
  transactionsImported: 3,
  duplicatesSkipped: 0,
  duplicatesFlagged: 2,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/import/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/import/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockFindFirst.mockResolvedValue(mockImportLog);
    mockDbTransaction.mockImplementation(
      async (
        fn: (tx: Record<string, Record<string, (...args: unknown[]) => unknown>>) => Promise<unknown>
      ) => {
        const tx = {
          transaction: { createMany: mockCreateMany },
          importLog: { update: mockUpdate },
        };
        return fn(tx);
      }
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = makeRequest({
      importLogId: "import_1",
      decisions: [
        {
          transaction: {
            date: "2024-01-15",
            description: "Coffee",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "keep",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when importLogId is missing", async () => {
    const req = makeRequest({
      decisions: [
        {
          transaction: {
            date: "2024-01-15",
            description: "Coffee",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "keep",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("importLogId is required");
  });

  it("returns 400 when decisions array is empty", async () => {
    const req = makeRequest({
      importLogId: "import_1",
      decisions: [],
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("decisions array is required");
  });

  it("returns 400 when a decision has invalid action", async () => {
    const req = makeRequest({
      importLogId: "import_1",
      decisions: [
        {
          transaction: {
            date: "2024-01-15",
            description: "Coffee",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "invalid",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("valid transaction and action");
  });

  it("returns 404 when import log does not belong to user", async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = makeRequest({
      importLogId: "import_other_user",
      decisions: [
        {
          transaction: {
            date: "2024-01-15",
            description: "Coffee",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "keep",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("import log not found");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "import_other_user", userId: "user_1" },
    });
  });

  it("saves kept transactions and returns 200", async () => {
    const req = makeRequest({
      importLogId: "import_1",
      decisions: [
        {
          transaction: {
            date: "2024-01-15T00:00:00.000Z",
            description: "Coffee Shop",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "keep",
        },
        {
          transaction: {
            date: "2024-01-16T00:00:00.000Z",
            description: "Grocery Store",
            amount: 52.3,
            type: "debit",
            referenceId: null,
          },
          action: "keep",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resolved).toBe(2);
    expect(data.kept).toBe(2);
    expect(data.skipped).toBe(0);

    // Verify transactions were created
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const createCall = mockCreateMany.mock.calls[0][0] as {
      data: Array<{ userId: string; description: string; sourceFileName: string }>;
    };
    expect(createCall.data).toHaveLength(2);
    expect(createCall.data[0].userId).toBe("user_1");
    expect(createCall.data[0].description).toBe("Coffee Shop");
    expect(createCall.data[0].sourceFileName).toBe("statement.csv");
    expect(createCall.data[1].description).toBe("Grocery Store");

    // Verify import log was updated
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "import_1" },
      data: {
        transactionsImported: { increment: 2 },
        duplicatesSkipped: { increment: 0 },
        duplicatesFlagged: { increment: -2 },
      },
    });
  });

  it("does not create transactions when all are skipped", async () => {
    const req = makeRequest({
      importLogId: "import_1",
      decisions: [
        {
          transaction: {
            date: "2024-01-15T00:00:00.000Z",
            description: "Coffee Shop",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "skip",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resolved).toBe(1);
    expect(data.kept).toBe(0);
    expect(data.skipped).toBe(1);

    // createMany should not have been called
    expect(mockCreateMany).not.toHaveBeenCalled();

    // Import log still updated
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "import_1" },
      data: {
        transactionsImported: { increment: 0 },
        duplicatesSkipped: { increment: 1 },
        duplicatesFlagged: { increment: -1 },
      },
    });
  });

  it("handles mixed keep and skip decisions", async () => {
    const req = makeRequest({
      importLogId: "import_1",
      decisions: [
        {
          transaction: {
            date: "2024-01-15T00:00:00.000Z",
            description: "Coffee Shop",
            amount: 5.0,
            type: "debit",
            referenceId: null,
          },
          action: "keep",
        },
        {
          transaction: {
            date: "2024-01-16T00:00:00.000Z",
            description: "Grocery Store",
            amount: 52.3,
            type: "debit",
            referenceId: null,
          },
          action: "skip",
        },
      ],
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resolved).toBe(2);
    expect(data.kept).toBe(1);
    expect(data.skipped).toBe(1);

    // Only one transaction created (the kept one)
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const createCall = mockCreateMany.mock.calls[0][0] as {
      data: Array<{ description: string }>;
    };
    expect(createCall.data).toHaveLength(1);
    expect(createCall.data[0].description).toBe("Coffee Shop");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "import_1" },
      data: {
        transactionsImported: { increment: 1 },
        duplicatesSkipped: { increment: 1 },
        duplicatesFlagged: { increment: -2 },
      },
    });
  });
});

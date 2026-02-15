import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "stream";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockTransactionFindMany = vi.fn();
const mockObligationFindMany = vi.fn();
const mockIncomeSourceFindMany = vi.fn();
const mockContributionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: (...args: unknown[]) => mockTransactionFindMany(...args),
    },
    obligation: {
      findMany: (...args: unknown[]) => mockObligationFindMany(...args),
    },
    incomeSource: {
      findMany: (...args: unknown[]) => mockIncomeSourceFindMany(...args),
    },
    contributionRecord: {
      findMany: (...args: unknown[]) => mockContributionFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

// Mock archiver to avoid requiring native zip compression in tests
const mockAppend = vi.fn();
const mockFinalize = vi.fn();
const mockPipe = vi.fn();
const mockOn = vi.fn();

vi.mock("archiver", () => ({
  default: () => {
    const archive = {
      append: mockAppend,
      finalize: mockFinalize,
      pipe: (stream: NodeJS.WritableStream) => {
        mockPipe(stream);
        // Write a minimal zip-like buffer to the stream after finalize is called
        mockFinalize.mockImplementation(async () => {
          if (stream instanceof PassThrough) {
            stream.end(Buffer.from("PK-fake-zip-content"));
          }
        });
      },
      on: mockOn,
    };
    return archive;
  },
}));

import { POST } from "../route";

describe("POST /api/user/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionFindMany.mockResolvedValue([]);
    mockObligationFindMany.mockResolvedValue([]);
    mockIncomeSourceFindMany.mockResolvedValue([]);
    mockContributionFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockTransactionFindMany).not.toHaveBeenCalled();
  });

  it("returns zip with correct CSV files", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });

    mockTransactionFindMany.mockResolvedValue([
      {
        id: "tx_1",
        date: new Date("2024-01-15"),
        description: "Netflix",
        amount: 22.99,
        type: "debit",
        referenceId: null,
        sourceFileName: "bank.csv",
        importedAt: new Date("2024-02-01"),
      },
    ]);

    mockObligationFindMany.mockResolvedValue([
      {
        id: "obl_1",
        name: "Rent",
        type: "recurring",
        amount: 2000,
        frequency: "monthly",
        frequencyDays: null,
        startDate: new Date("2024-01-01"),
        endDate: null,
        nextDueDate: new Date("2024-02-01"),
        isPaused: false,
        isActive: true,
        isArchived: false,
        fundGroupId: null,
        createdAt: new Date("2024-01-01"),
      },
    ]);

    mockIncomeSourceFindMany.mockResolvedValue([
      {
        id: "inc_1",
        name: "Salary",
        expectedAmount: 5000,
        frequency: "monthly",
        frequencyDays: null,
        isIrregular: false,
        minimumExpected: null,
        nextExpectedDate: new Date("2024-02-01"),
        isPaused: false,
        isActive: true,
        createdAt: new Date("2024-01-01"),
      },
    ]);

    mockContributionFindMany.mockResolvedValue([
      {
        id: "con_1",
        obligationId: "obl_1",
        amount: 500,
        date: new Date("2024-01-15"),
        type: "contribution",
        note: null,
        createdAt: new Date("2024-01-15"),
      },
    ]);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=export.zip",
    );

    // Verify all four CSVs were appended
    expect(mockAppend).toHaveBeenCalledTimes(4);

    const appendCalls = mockAppend.mock.calls;

    // Transactions CSV
    const txCsv = appendCalls[0][0] as string;
    expect(txCsv).toContain("id,date,description,amount,type,referenceId,sourceFileName,importedAt");
    expect(txCsv).toContain("tx_1");
    expect(txCsv).toContain("Netflix");
    expect(appendCalls[0][1]).toEqual({ name: "transactions.csv" });

    // Obligations CSV
    const oblCsv = appendCalls[1][0] as string;
    expect(oblCsv).toContain("id,name,type,amount");
    expect(oblCsv).toContain("obl_1");
    expect(oblCsv).toContain("Rent");
    expect(appendCalls[1][1]).toEqual({ name: "obligations.csv" });

    // Income sources CSV
    const incCsv = appendCalls[2][0] as string;
    expect(incCsv).toContain("id,name,expectedAmount,frequency");
    expect(incCsv).toContain("inc_1");
    expect(incCsv).toContain("Salary");
    expect(appendCalls[2][1]).toEqual({ name: "income_sources.csv" });

    // Contributions CSV
    const conCsv = appendCalls[3][0] as string;
    expect(conCsv).toContain("id,obligationId,amount,date,type,note,createdAt");
    expect(conCsv).toContain("con_1");
    expect(appendCalls[3][1]).toEqual({ name: "contributions.csv" });
  });

  it("queries only the authenticated user's data", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_42" });

    const res = await POST();

    expect(res.status).toBe(200);

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_42" },
      }),
    );
    expect(mockObligationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_42" },
      }),
    );
    expect(mockIncomeSourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_42" },
      }),
    );
    expect(mockContributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { obligation: { userId: "user_42" } },
      }),
    );
  });

  it("handles empty data sets", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    // All four CSVs should still be appended (with headers only)
    expect(mockAppend).toHaveBeenCalledTimes(4);

    const txCsv = mockAppend.mock.calls[0][0] as string;
    expect(txCsv).toContain("id,date,description,amount");
    // Only header, no data rows
    expect(txCsv.trim().split("\n")).toHaveLength(1);
  });

  it("escapes CSV fields with commas and quotes", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1" });

    mockTransactionFindMany.mockResolvedValue([
      {
        id: "tx_1",
        date: new Date("2024-01-15"),
        description: 'Payment "Special", Inc.',
        amount: 100,
        type: "debit",
        referenceId: null,
        sourceFileName: "file,with,commas.csv",
        importedAt: new Date("2024-02-01"),
      },
    ]);

    const res = await POST();

    expect(res.status).toBe(200);

    const txCsv = mockAppend.mock.calls[0][0] as string;
    // Field with commas and quotes should be escaped
    expect(txCsv).toContain('"Payment ""Special"", Inc."');
    expect(txCsv).toContain('"file,with,commas.csv"');
  });
});

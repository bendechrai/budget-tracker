import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    importLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { GET } from "../route";

const sampleLogs = [
  {
    id: "log_2",
    userId: "user_1",
    fileName: "feb-statement.csv",
    format: "csv",
    transactionsFound: 30,
    transactionsImported: 25,
    duplicatesSkipped: 3,
    duplicatesFlagged: 2,
    importedAt: "2026-02-15T12:00:00.000Z",
  },
  {
    id: "log_1",
    userId: "user_1",
    fileName: "jan-statement.ofx",
    format: "ofx",
    transactionsFound: 50,
    transactionsImported: 50,
    duplicatesSkipped: 0,
    duplicatesFlagged: 0,
    importedAt: "2026-01-15T12:00:00.000Z",
  },
];

describe("GET /api/import/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with user's import logs ordered by importedAt desc", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue(sampleLogs);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.importLogs).toEqual(sampleLogs);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: { importedAt: "desc" },
    });
  });

  it("returns empty array when user has no import logs", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_2", email: "new@example.com" });
    mockFindMany.mockResolvedValue([]);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.importLogs).toEqual([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns only the authenticated user's import logs", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user_1", email: "test@example.com" });
    mockFindMany.mockResolvedValue(sampleLogs);

    await GET();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: { importedAt: "desc" },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockFindMany = vi.fn();
const mockCreateMany = vi.fn();
const mockImportLogCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      createMany: (...args: unknown[]) => mockCreateMany(...args),
    },
    importLog: {
      create: (...args: unknown[]) => mockImportLogCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { POST } from "../route";

const SAMPLE_CSV = [
  "Date,Description,Amount,Type",
  "2024-01-15,Coffee Shop,-4.50,debit",
  "2024-01-16,Salary,3000.00,credit",
  "2024-01-17,Grocery Store,-52.30,debit",
].join("\n");

const SAMPLE_OFX = `
OFXHEADER:100
DATA:OFXSGML

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-25.00
<FITID>TXN001
<NAME>Coffee Shop
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>3000.00
<FITID>TXN002
<NAME>Salary Deposit
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

/**
 * Create a file-like object compatible with jsdom (which lacks Blob.text()).
 * The route reads the file via .text(), .name, and .size.
 */
function makeFileLike(
  content: string,
  fileName: string
): File {
  return {
    name: fileName,
    size: content.length,
    type: "application/octet-stream",
    text: () => Promise.resolve(content),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
    slice: () => new Blob(),
    stream: () => new ReadableStream(),
    lastModified: Date.now(),
  } as unknown as File;
}

function makeUploadRequest(fileName: string, content: string): NextRequest {
  const req = new NextRequest("http://localhost/api/import/upload", {
    method: "POST",
  });
  const file = makeFileLike(content, fileName);
  vi.spyOn(req, "formData").mockResolvedValue({
    get: (key: string) => (key === "file" ? file : null),
  } as unknown as FormData);
  return req;
}

function makeEmptyFormRequest(): NextRequest {
  const req = new NextRequest("http://localhost/api/import/upload", {
    method: "POST",
  });
  vi.spyOn(req, "formData").mockResolvedValue({
    get: () => null,
  } as unknown as FormData);
  return req;
}

describe("POST /api/import/upload", () => {
  const mockUser = { id: "user_1", email: "test@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockFindMany.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (
        fn: (tx: Record<string, Record<string, (...args: unknown[]) => unknown>>) => Promise<unknown>
      ) => {
        const tx = {
          transaction: { createMany: mockCreateMany },
          importLog: { create: mockImportLogCreate },
        };
        mockImportLogCreate.mockResolvedValue({
          id: "import_1",
          userId: "user_1",
          fileName: "test.csv",
          format: "csv",
          transactionsFound: 0,
          transactionsImported: 0,
          duplicatesSkipped: 0,
          duplicatesFlagged: 0,
        });
        return fn(tx);
      }
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = makeUploadRequest("statement.csv", SAMPLE_CSV);

    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("returns 400 when no file is provided", async () => {
    const req = makeEmptyFormRequest();

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("file is required");
  });

  it("returns 400 for unsupported file format", async () => {
    const req = makeUploadRequest("statement.pdf", "pdf content");

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("unsupported file format");
  });

  it("returns 400 for empty file", async () => {
    const req = new NextRequest("http://localhost/api/import/upload", {
      method: "POST",
    });
    const emptyFile = makeFileLike("", "empty.csv");
    vi.spyOn(req, "formData").mockResolvedValue({
      get: (key: string) => (key === "file" ? emptyFile : null),
    } as unknown as FormData);

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("file is empty");
  });

  it("returns 400 when no transactions found in file", async () => {
    const req = makeUploadRequest("statement.csv", "just,some,random,text\n");

    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("no transactions found in file");
  });

  it("imports CSV file and returns 201 with summary", async () => {
    const req = makeUploadRequest("statement.csv", SAMPLE_CSV);

    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.fileName).toBe("statement.csv");
    expect(data.format).toBe("csv");
    expect(data.transactionsFound).toBe(3);
    expect(data.transactionsImported).toBe(3);
    expect(data.duplicatesSkipped).toBe(0);
    expect(data.duplicatesFlagged).toBe(0);
    expect(data.flagged).toEqual([]);
    expect(data.importLogId).toBe("import_1");

    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const createCall = mockCreateMany.mock.calls[0][0] as {
      data: Array<{ userId: string; sourceFileName: string }>;
    };
    expect(createCall.data).toHaveLength(3);
    expect(createCall.data[0].userId).toBe("user_1");
    expect(createCall.data[0].sourceFileName).toBe("statement.csv");

    expect(mockImportLogCreate).toHaveBeenCalledTimes(1);
    const logCall = mockImportLogCreate.mock.calls[0][0] as {
      data: {
        userId: string;
        format: string;
        transactionsFound: number;
        transactionsImported: number;
      };
    };
    expect(logCall.data.userId).toBe("user_1");
    expect(logCall.data.format).toBe("csv");
    expect(logCall.data.transactionsFound).toBe(3);
    expect(logCall.data.transactionsImported).toBe(3);
  });

  it("imports OFX file and returns 201 with summary", async () => {
    const req = makeUploadRequest("statement.ofx", SAMPLE_OFX);

    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.fileName).toBe("statement.ofx");
    expect(data.format).toBe("ofx");
    expect(data.transactionsFound).toBe(2);
    expect(data.transactionsImported).toBe(2);
    expect(data.duplicatesSkipped).toBe(0);
    expect(data.duplicatesFlagged).toBe(0);
  });

  it("supports QFX file extension", async () => {
    const req = makeUploadRequest("statement.qfx", SAMPLE_OFX);

    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.format).toBe("ofx");
  });

  it("skips duplicates matched by referenceId for OFX", async () => {
    mockFindMany.mockResolvedValue([
      {
        referenceId: "TXN001",
        fingerprint: "existing_fp",
        date: new Date("2024-01-15"),
        amount: 25.0,
        description: "Coffee Shop",
      },
    ]);

    const req = makeUploadRequest("statement.ofx", SAMPLE_OFX);

    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.transactionsFound).toBe(2);
    expect(data.duplicatesSkipped).toBe(1);
    expect(data.transactionsImported).toBe(1);
  });

  it("does not create transactions when all are duplicates", async () => {
    mockFindMany.mockResolvedValue([
      {
        referenceId: "TXN001",
        fingerprint: "fp1",
        date: new Date("2024-01-15"),
        amount: 25.0,
        description: "Coffee Shop",
      },
      {
        referenceId: "TXN002",
        fingerprint: "fp2",
        date: new Date("2024-01-16"),
        amount: 3000.0,
        description: "Salary Deposit",
      },
    ]);

    const req = makeUploadRequest("statement.ofx", SAMPLE_OFX);

    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.transactionsImported).toBe(0);
    expect(data.duplicatesSkipped).toBe(2);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("fetches existing transactions scoped to current user", async () => {
    const req = makeUploadRequest("statement.csv", SAMPLE_CSV);

    await POST(req);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      select: {
        referenceId: true,
        fingerprint: true,
        date: true,
        amount: true,
        description: true,
      },
    });
  });
});

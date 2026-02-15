import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import archiver from "archiver";
import { PassThrough } from "stream";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString();
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",") + "\n";
}

function buildTransactionsCsv(
  transactions: Array<{
    id: string;
    date: Date;
    description: string;
    amount: number;
    type: string;
    referenceId: string | null;
    sourceFileName: string;
    importedAt: Date;
  }>,
): string {
  const header = toCsvRow([
    "id",
    "date",
    "description",
    "amount",
    "type",
    "referenceId",
    "sourceFileName",
    "importedAt",
  ]);
  const rows = transactions.map((t) =>
    toCsvRow([
      t.id,
      formatDate(t.date),
      t.description,
      String(t.amount),
      t.type,
      t.referenceId ?? "",
      t.sourceFileName,
      formatDate(t.importedAt),
    ]),
  );
  return header + rows.join("");
}

function buildObligationsCsv(
  obligations: Array<{
    id: string;
    name: string;
    type: string;
    amount: number;
    frequency: string | null;
    frequencyDays: number | null;
    startDate: Date;
    endDate: Date | null;
    nextDueDate: Date;
    isPaused: boolean;
    isActive: boolean;
    isArchived: boolean;
    fundGroupId: string | null;
    createdAt: Date;
  }>,
): string {
  const header = toCsvRow([
    "id",
    "name",
    "type",
    "amount",
    "frequency",
    "frequencyDays",
    "startDate",
    "endDate",
    "nextDueDate",
    "isPaused",
    "isActive",
    "isArchived",
    "fundGroupId",
    "createdAt",
  ]);
  const rows = obligations.map((o) =>
    toCsvRow([
      o.id,
      o.name,
      o.type,
      String(o.amount),
      o.frequency ?? "",
      o.frequencyDays != null ? String(o.frequencyDays) : "",
      formatDate(o.startDate),
      formatDate(o.endDate),
      formatDate(o.nextDueDate),
      String(o.isPaused),
      String(o.isActive),
      String(o.isArchived),
      o.fundGroupId ?? "",
      formatDate(o.createdAt),
    ]),
  );
  return header + rows.join("");
}

function buildIncomeSourcesCsv(
  sources: Array<{
    id: string;
    name: string;
    expectedAmount: number;
    frequency: string;
    frequencyDays: number | null;
    isIrregular: boolean;
    minimumExpected: number | null;
    nextExpectedDate: Date | null;
    isPaused: boolean;
    isActive: boolean;
    createdAt: Date;
  }>,
): string {
  const header = toCsvRow([
    "id",
    "name",
    "expectedAmount",
    "frequency",
    "frequencyDays",
    "isIrregular",
    "minimumExpected",
    "nextExpectedDate",
    "isPaused",
    "isActive",
    "createdAt",
  ]);
  const rows = sources.map((s) =>
    toCsvRow([
      s.id,
      s.name,
      String(s.expectedAmount),
      s.frequency,
      s.frequencyDays != null ? String(s.frequencyDays) : "",
      String(s.isIrregular),
      s.minimumExpected != null ? String(s.minimumExpected) : "",
      formatDate(s.nextExpectedDate),
      String(s.isPaused),
      String(s.isActive),
      formatDate(s.createdAt),
    ]),
  );
  return header + rows.join("");
}

function buildContributionsCsv(
  records: Array<{
    id: string;
    obligationId: string;
    amount: number;
    date: Date;
    type: string;
    note: string | null;
    createdAt: Date;
  }>,
): string {
  const header = toCsvRow([
    "id",
    "obligationId",
    "amount",
    "date",
    "type",
    "note",
    "createdAt",
  ]);
  const rows = records.map((r) =>
    toCsvRow([
      r.id,
      r.obligationId,
      String(r.amount),
      formatDate(r.date),
      r.type,
      r.note ?? "",
      formatDate(r.createdAt),
    ]),
  );
  return header + rows.join("");
}

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [transactions, obligations, incomeSources, contributions] =
      await Promise.all([
        prisma.transaction.findMany({
          where: { userId: user.id },
          orderBy: { date: "desc" },
        }),
        prisma.obligation.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.incomeSource.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.contributionRecord.findMany({
          where: { obligation: { userId: user.id } },
          orderBy: { date: "desc" },
        }),
      ]);

    const transactionsCsv = buildTransactionsCsv(transactions);
    const obligationsCsv = buildObligationsCsv(obligations);
    const incomeSourcesCsv = buildIncomeSourcesCsv(incomeSources);
    const contributionsCsv = buildContributionsCsv(contributions);

    const passThrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(passThrough);
    archive.append(transactionsCsv, { name: "transactions.csv" });
    archive.append(obligationsCsv, { name: "obligations.csv" });
    archive.append(incomeSourcesCsv, { name: "income_sources.csv" });
    archive.append(contributionsCsv, { name: "contributions.csv" });
    await archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of passThrough) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=export.zip",
      },
    });
  } catch (error) {
    logError("failed to export user data", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 },
    );
  }
}

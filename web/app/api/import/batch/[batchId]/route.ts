import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { processImportBatch } from "@/lib/import/batchProcessor";

/** If a processing batch hasn't been updated in this many ms, re-trigger it. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { batchId } = await params;

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        files: {
          select: {
            id: true,
            position: true,
            fileName: true,
            format: true,
            status: true,
            transactionsFound: true,
            transactionsImported: true,
            duplicatesSkipped: true,
            duplicatesFlagged: true,
            flaggedData: true,
            importLogId: true,
            errorMessage: true,
          },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!batch || batch.userId !== user.id) {
      return NextResponse.json({ error: "batch not found" }, { status: 404 });
    }

    // Stale-job recovery: if processing but no update in 5 min, re-trigger
    if (batch.status === "processing") {
      const msSinceUpdate = Date.now() - batch.updatedAt.getTime();
      if (msSinceUpdate > STALE_THRESHOLD_MS) {
        after(() => {
          processImportBatch(batch.id, user.id).catch((error) => {
            logError("stale batch re-trigger failed", error);
          });
        });
      }
    }

    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      fileCount: batch.fileCount,
      filesCompleted: batch.filesCompleted,
      totalTransactionsFound: batch.totalTransactionsFound,
      totalTransactionsImported: batch.totalTransactionsImported,
      totalDuplicatesSkipped: batch.totalDuplicatesSkipped,
      totalDuplicatesFlagged: batch.totalDuplicatesFlagged,
      patternDetectionComplete: batch.patternDetectionComplete,
      errorMessage: batch.errorMessage,
      files: batch.files,
    });
  } catch (error) {
    logError("failed to fetch batch status", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

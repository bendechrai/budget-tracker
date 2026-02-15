import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { logError } from "@/lib/logging";
import { processImportBatch } from "@/lib/import/batchProcessor";
import type { ImportFormat } from "@/app/generated/prisma/client";

const FORMAT_MAP: Record<string, ImportFormat> = {
  ".csv": "csv",
  ".ofx": "ofx",
  ".qfx": "ofx",
  ".pdf": "pdf",
};

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot).toLowerCase();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const entries = formData.getAll("files");

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "at least one file is required" },
        { status: 400 }
      );
    }

    // Validate all files upfront — reject entire batch if any invalid
    const files: Array<{ blob: File; format: ImportFormat }> = [];

    for (const entry of entries) {
      if (typeof entry === "string" || !("name" in entry)) {
        return NextResponse.json(
          { error: "invalid file in upload" },
          { status: 400 }
        );
      }

      const blob = entry as File;

      if (blob.size === 0) {
        return NextResponse.json(
          { error: `file "${blob.name}" is empty` },
          { status: 400 }
        );
      }

      const ext = getFileExtension(blob.name);
      const format = FORMAT_MAP[ext];

      if (!format) {
        return NextResponse.json(
          {
            error: `unsupported file format for "${blob.name}". Supported formats: PDF (.pdf), CSV (.csv), OFX (.ofx, .qfx)`,
          },
          { status: 400 }
        );
      }

      files.push({ blob, format });
    }

    // Create batch and file records with raw bytes
    const batch = await prisma.importBatch.create({
      data: {
        userId: user.id,
        fileCount: files.length,
        files: {
          create: await Promise.all(
            files.map(async (f, i) => {
              const arrayBuffer = await f.blob.arrayBuffer();
              return {
                position: i,
                fileName: f.blob.name,
                format: f.format,
                fileData: Buffer.from(arrayBuffer),
              };
            })
          ),
        },
      },
      include: {
        files: {
          select: {
            id: true,
            position: true,
            fileName: true,
            format: true,
            status: true,
          },
          orderBy: { position: "asc" },
        },
      },
    });

    // Trigger background processing after response is sent
    after(() => {
      processImportBatch(batch.id, user.id).catch((error) => {
        logError("background batch processing failed", error);
      });
    });

    return NextResponse.json(
      {
        batchId: batch.id,
        status: batch.status,
        fileCount: batch.fileCount,
        files: batch.files,
      },
      { status: 202 }
    );
  } catch (error) {
    logError("failed to create import batch", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

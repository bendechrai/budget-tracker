import { PrismaClient } from "@/app/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Prisma 7 with prisma.config.ts provides the datasource URL at runtime,
// so no adapter or accelerateUrl is needed in the constructor options.
export const prisma =
  globalThis.prisma ??
  new (PrismaClient as unknown as new () => PrismaClient)();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

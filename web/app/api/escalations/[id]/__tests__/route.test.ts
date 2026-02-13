import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockEscalationFindUnique = vi.fn();
const mockEscalationDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    escalation: {
      findUnique: (...args: unknown[]) => mockEscalationFindUnique(...args),
      delete: (...args: unknown[]) => mockEscalationDelete(...args),
    },
  },
}));

vi.mock("@/lib/logging", () => ({
  logError: vi.fn(),
}));

import { DELETE } from "../route";

const mockUser = { id: "user-1", email: "test@example.com" };

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

const baseEscalation = {
  id: "esc-1",
  obligationId: "obl-1",
  changeType: "percentage",
  value: 3,
  effectiveDate: new Date("2026-07-01"),
  intervalMonths: 12,
  isApplied: false,
  appliedAt: null,
  obligation: {
    id: "obl-1",
    userId: "user-1",
    name: "Rent",
    type: "recurring",
    amount: 2000,
    isActive: true,
  },
};

describe("DELETE /api/escalations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockEscalationFindUnique.mockResolvedValue(baseEscalation);
    mockEscalationDelete.mockResolvedValue(baseEscalation);
  });

  it("deletes an escalation rule (200)", async () => {
    const req = new NextRequest("http://localhost/api/escalations/esc-1", {
      method: "DELETE",
    });

    const res = await DELETE(req, makeParams("esc-1"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockEscalationDelete).toHaveBeenCalledWith({
      where: { id: "esc-1" },
    });
  });

  it("verifies ownership via obligation (404 for other user)", async () => {
    mockEscalationFindUnique.mockResolvedValue({
      ...baseEscalation,
      obligation: {
        ...baseEscalation.obligation,
        userId: "other-user",
      },
    });

    const req = new NextRequest("http://localhost/api/escalations/esc-1", {
      method: "DELETE",
    });

    const res = await DELETE(req, makeParams("esc-1"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockEscalationDelete).not.toHaveBeenCalled();
  });

  it("returns 404 for nonexistent escalation", async () => {
    mockEscalationFindUnique.mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/escalations/nonexistent",
      { method: "DELETE" }
    );

    const res = await DELETE(req, makeParams("nonexistent"));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("not found");
    expect(mockEscalationDelete).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/escalations/esc-1", {
      method: "DELETE",
    });

    const res = await DELETE(req, makeParams("esc-1"));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
    expect(mockEscalationFindUnique).not.toHaveBeenCalled();
    expect(mockEscalationDelete).not.toHaveBeenCalled();
  });
});

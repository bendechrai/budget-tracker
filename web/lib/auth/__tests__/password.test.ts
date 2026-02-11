import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password hashing", () => {
  it("hashes a password and verifies it matches", async () => {
    const plain = "mySecureP@ss1";
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correctPassword1");

    expect(await verifyPassword("wrongPassword1", hash)).toBe(false);
  });

  it("produces different hashes for the same password", async () => {
    const plain = "samePassword1";
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1).not.toBe(hash2);
  });
});

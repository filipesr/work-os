import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { requireSelfOrManager } from "@/lib/permissions";

const mockAuth = vi.mocked(auth);

describe("requireSelfOrManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the user themselves (any role)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    await expect(requireSelfOrManager("u1")).resolves.toMatchObject({ id: "u1" });
  });
  it("allows a manager/admin viewing someone else", async () => {
    mockAuth.mockResolvedValue({ user: { id: "mgr", role: "MANAGER" } } as never);
    await expect(requireSelfOrManager("u2")).resolves.toMatchObject({ id: "mgr" });
  });
  it("denies a member viewing someone else (fail-closed)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    await expect(requireSelfOrManager("u2")).rejects.toThrow(/Access Denied/i);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/auth before importing
vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { auth as mockAuthFn } from "@/auth";
import {
  hasRole,
  hasAnyRole,
  getUserRole,
  getUserTeamId,
  requireAuth,
  requireRole,
  requireAnyRole,
} from "@/lib/auth";

const mockAuth = vi.mocked(mockAuthFn);

describe("hasRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when user has the role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "ADMIN" } } as any);
    expect(await hasRole("ADMIN" as any)).toBe(true);
  });

  it("returns false when user has a different role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "MEMBER" } } as any);
    expect(await hasRole("ADMIN" as any)).toBe(false);
  });

  it("returns false when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    expect(await hasRole("ADMIN" as any)).toBe(false);
  });
});

describe("hasAnyRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when user has one of the roles", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "MANAGER" } } as any);
    expect(await hasAnyRole(["ADMIN", "MANAGER"] as any)).toBe(true);
  });

  it("returns false when user has none of the roles", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "VIEWER" } } as any);
    expect(await hasAnyRole(["ADMIN", "MANAGER"] as any)).toBe(false);
  });
});

describe("getUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the user role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "SUPERVISOR" } } as any);
    expect(await getUserRole()).toBe("SUPERVISOR");
  });

  it("returns null when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    expect(await getUserRole()).toBeNull();
  });
});

describe("getUserTeamId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the team ID", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", teamId: "team-1" },
    } as any);
    expect(await getUserTeamId()).toBe("team-1");
  });

  it("returns null when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    expect(await getUserTeamId()).toBeNull();
  });
});

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session when authenticated", async () => {
    const session = { user: { id: "1" } };
    mockAuth.mockResolvedValue(session as any);

    const result = await requireAuth();
    expect(result).toEqual(session);
  });

  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    await expect(requireAuth()).rejects.toThrow("Unauthorized");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session when user has the required role", async () => {
    const session = { user: { id: "1", role: "ADMIN" } };
    mockAuth.mockResolvedValue(session as any);

    const result = await requireRole("ADMIN" as any);
    expect(result).toEqual(session);
  });

  it("throws when user lacks the required role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "MEMBER" } } as any);
    await expect(requireRole("ADMIN" as any)).rejects.toThrow("Forbidden");
  });
});

describe("requireAnyRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session when user has one of required roles", async () => {
    const session = { user: { id: "1", role: "MANAGER" } };
    mockAuth.mockResolvedValue(session as any);

    const result = await requireAnyRole(["ADMIN", "MANAGER"] as any);
    expect(result).toEqual(session);
  });

  it("throws when user lacks all required roles", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "VIEWER" } } as any);
    await expect(requireAnyRole(["ADMIN", "MANAGER"] as any)).rejects.toThrow("Forbidden");
  });
});

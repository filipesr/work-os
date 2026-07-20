import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/auth before importing the module under test
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock @prisma/client UserRole enum
vi.mock("@prisma/client", () => ({
  UserRole: {
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    SUPERVISOR: "SUPERVISOR",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER",
  },
}));

// Mock the Prisma client (used by getUserTeamIds)
vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: vi.fn() } },
}));

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getSessionUser,
  checkRole,
  requireAdmin,
  requireManagerOrAdmin,
  requireSupervisorOrHigher,
  requireMemberOrHigher,
  getUserRole,
  hasRole,
  hasAnyRole,
  getUserTeamIds,
} from "@/lib/permissions";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

describe("getSessionUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user when authenticated", async () => {
    const mockUser = { id: "user-1", name: "Test", role: "ADMIN" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    const user = await getSessionUser();
    expect(user).toEqual(mockUser);
  });

  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);

    await expect(getSessionUser()).rejects.toThrow("Not Authenticated");
  });

  it("throws when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: undefined } as any);

    await expect(getSessionUser()).rejects.toThrow("Not Authenticated");
  });
});

describe("checkRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows user with matching role", async () => {
    const mockUser = { id: "user-1", role: "ADMIN" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    const user = await checkRole(["ADMIN"] as any);
    expect(user).toEqual(mockUser);
  });

  it("allows user with one of multiple matching roles", async () => {
    const mockUser = { id: "user-1", role: "MANAGER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    const user = await checkRole(["ADMIN", "MANAGER"] as any);
    expect(user).toEqual(mockUser);
  });

  it("throws when user lacks required role", async () => {
    const mockUser = { id: "user-1", role: "VIEWER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(checkRole(["ADMIN"] as any)).rejects.toThrow(
      "Access Denied: Insufficient permissions."
    );
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows ADMIN", async () => {
    const mockUser = { id: "user-1", role: "ADMIN" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    const user = await requireAdmin();
    expect(user).toEqual(mockUser);
  });

  it("rejects MANAGER", async () => {
    const mockUser = { id: "user-1", role: "MANAGER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireAdmin()).rejects.toThrow("Access Denied");
  });
});

describe("requireManagerOrAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows ADMIN", async () => {
    const mockUser = { id: "user-1", role: "ADMIN" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireManagerOrAdmin()).resolves.toBeDefined();
  });

  it("allows MANAGER", async () => {
    const mockUser = { id: "user-1", role: "MANAGER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireManagerOrAdmin()).resolves.toBeDefined();
  });

  it("rejects MEMBER", async () => {
    const mockUser = { id: "user-1", role: "MEMBER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireManagerOrAdmin()).rejects.toThrow("Access Denied");
  });
});

describe("requireSupervisorOrHigher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows SUPERVISOR", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", role: "SUPERVISOR" } } as any);
    await expect(requireSupervisorOrHigher()).resolves.toBeDefined();
  });

  it("allows MANAGER and ADMIN", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", role: "MANAGER" } } as any);
    await expect(requireSupervisorOrHigher()).resolves.toBeDefined();
    mockAuth.mockResolvedValue({ user: { id: "user-2", role: "ADMIN" } } as any);
    await expect(requireSupervisorOrHigher()).resolves.toBeDefined();
  });

  it("rejects MEMBER", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", role: "MEMBER" } } as any);
    await expect(requireSupervisorOrHigher()).rejects.toThrow("Access Denied");
  });
});

describe("requireMemberOrHigher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows MEMBER", async () => {
    const mockUser = { id: "user-1", role: "MEMBER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireMemberOrHigher()).resolves.toBeDefined();
  });

  it("allows SUPERVISOR", async () => {
    const mockUser = { id: "user-1", role: "SUPERVISOR" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireMemberOrHigher()).resolves.toBeDefined();
  });

  it("rejects VIEWER", async () => {
    const mockUser = { id: "user-1", role: "VIEWER" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    await expect(requireMemberOrHigher()).rejects.toThrow("Access Denied");
  });
});

describe("getUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns role when authenticated", async () => {
    const mockUser = { id: "user-1", role: "ADMIN" };
    mockAuth.mockResolvedValue({ user: mockUser } as any);

    const role = await getUserRole();
    expect(role).toBe("ADMIN");
  });

  it("returns null when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);

    const role = await getUserRole();
    expect(role).toBeNull();
  });
});

describe("hasRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the user has the role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "ADMIN" } } as any);
    expect(await hasRole("ADMIN" as any)).toBe(true);
  });

  it("returns false when the user has a different role", async () => {
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

  it("returns true when the user has one of the roles", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "MANAGER" } } as any);
    expect(await hasAnyRole(["ADMIN", "MANAGER"] as any)).toBe(true);
  });

  it("returns false when the user has none of the roles", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "VIEWER" } } as any);
    expect(await hasAnyRole(["ADMIN", "MANAGER"] as any)).toBe(false);
  });

  it("returns false when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    expect(await hasAnyRole(["ADMIN"] as any)).toBe(false);
  });
});

describe("getUserTeamIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    expect(await getUserTeamIds()).toEqual([]);
  });

  it("returns the user's team ids when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as any);
    mockFindUnique.mockResolvedValue({ teams: [{ id: "t1" }, { id: "t2" }] } as any);
    expect(await getUserTeamIds()).toEqual(["t1", "t2"]);
  });

  it("returns [] when the user has no teams", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as any);
    mockFindUnique.mockResolvedValue({ teams: [] } as any);
    expect(await getUserTeamIds()).toEqual([]);
  });
});

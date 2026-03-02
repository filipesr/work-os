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

import { auth } from "@/auth";
import {
  getSessionUser,
  checkRole,
  requireAdmin,
  requireManagerOrAdmin,
  requireMemberOrHigher,
  getUserRole,
} from "@/lib/permissions";

const mockAuth = vi.mocked(auth);

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

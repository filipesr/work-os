import type { Metadata } from "next";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { updateUserRoleAndTeams } from "@/lib/actions/user";

export const metadata: Metadata = {
  title: "Usuários",
};
import { Prisma, UserRole } from "@prisma/client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import EditUserButton from "./edit-user-button";
import { UserFilters } from "./UserFilters";
import { requireAdmin } from "@/lib/permissions";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DEFAULT_PAGE_SIZE, paginate, parsePage } from "@/lib/pagination";

const SORTABLE_FIELDS = ["name", "email", "role"] as const;
type SortField = (typeof SORTABLE_FIELDS)[number];

type UsersQuery = {
  q?: string;
  role?: string;
  team?: string;
  sort?: string;
  dir?: string;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single.length > 0 ? single : undefined;
}

async function getUsers(page: number, pageSize: number, query: UsersQuery) {
  await requireAdmin();

  const where: Prisma.UserWhereInput = {};
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.role && (Object.values(UserRole) as string[]).includes(query.role)) {
    where.role = query.role as UserRole;
  }
  if (query.team) {
    where.teams = { some: { id: query.team } };
  }

  const sortField: SortField = (SORTABLE_FIELDS as readonly string[]).includes(query.sort ?? "")
    ? (query.sort as SortField)
    : "email";
  const direction: Prisma.SortOrder = query.dir === "desc" ? "desc" : "asc";

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { teams: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { [sortField]: direction },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return paginate(items, total, page, pageSize);
}

async function getTeams() {
  await requireAdmin();
  return await prisma.team.findMany({
    orderBy: { name: "asc" },
  });
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const query: UsersQuery = {
    q: firstParam(params.q),
    role: firstParam(params.role),
    team: firstParam(params.team),
    sort: firstParam(params.sort),
    dir: firstParam(params.dir),
  };

  const [paginatedUsers, teams] = await Promise.all([
    getUsers(page, DEFAULT_PAGE_SIZE, query),
    getTeams(),
  ]);
  const { items: users, total, totalPages, pageSize } = paginatedUsers;
  const t = await getTranslations("admin.users");

  const currentSort: SortField = (SORTABLE_FIELDS as readonly string[]).includes(query.sort ?? "")
    ? (query.sort as SortField)
    : "email";
  const currentDir = query.dir === "desc" ? "desc" : "asc";

  // Sort link for a column header: toggle direction when already active, else asc.
  // Filters (q/role/team) are preserved; page resets implicitly (omitted).
  const sortHref = (field: SortField) => {
    const sp = new URLSearchParams();
    if (query.q) sp.set("q", query.q);
    if (query.role) sp.set("role", query.role);
    if (query.team) sp.set("team", query.team);
    sp.set("sort", field);
    sp.set("dir", currentSort === field && currentDir === "asc" ? "desc" : "asc");
    return `/admin/users?${sp.toString()}`;
  };

  const SortHeader = ({
    field,
    label,
    align = "left",
  }: {
    field: SortField;
    label: string;
    align?: "left" | "right";
  }) => {
    const active = currentSort === field;
    const Icon = active ? (currentDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th
        className={`px-6 py-4 ${
          align === "right" ? "text-right" : "text-left"
        } text-xs font-bold text-foreground uppercase tracking-wider`}
      >
        <Link
          href={sortHref(field)}
          className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${
            align === "right" ? "flex-row-reverse" : ""
          }`}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
        </Link>
      </th>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<UserFilters teams={teams} />}
      />

      {/* Users List */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <SortHeader field="name" label={t("table.user")} />
              <SortHeader field="email" label={t("table.email")} />
              <SortHeader field="role" label={t("table.role")} />
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.team")}
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-accent transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {user.image && (
                      <img
                        className="h-10 w-10 rounded-full mr-3 border border-border"
                        src={getProxiedImageUrl(user.image) || undefined}
                        alt=""
                      />
                    )}
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {user.name || t("noName")}
                    </Link>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge tone="info" label={t(`roles.${user.role.toLowerCase()}`)} />
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-muted-foreground">
                    {user.teams.length > 0
                      ? user.teams.map((tm) => tm.name).join(", ")
                      : t("noTeam")}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <EditUserButton
                    user={{
                      id: user.id,
                      name: user.name,
                      email: user.email,
                      role: user.role,
                      teams: user.teams,
                      birthday: user.birthday ? user.birthday.toISOString().slice(0, 10) : null,
                      admissionDate: user.admissionDate
                        ? user.admissionDate.toISOString().slice(0, 10)
                        : null,
                      weeklyCapacityHours: user.weeklyCapacityHours,
                    }}
                    teams={teams}
                    updateUser={updateUserRoleAndTeams}
                  />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("noUsers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          basePath="/admin/users"
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          params={query}
        />
      </div>
    </div>
  );
}

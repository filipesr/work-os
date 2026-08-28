import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getClientLoad } from "@/lib/actions/client-load";
import {
  mondayOfWeek,
  parseWeekParam,
  formatISODate,
  formatDisplayDate,
  todayInSaoPaulo,
} from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { WeekNav } from "@/components/shared/WeekNav";

export const metadata: Metadata = { title: "Carga por cliente" };

export default async function ClientLoadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const monday = parseWeekParam(sp.week);
  const t = await getTranslations("planning.clientLoad");
  const carga = await getClientLoad(formatISODate(monday), sp.team);

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
        actions={
          <WeekNav
            monday={monday}
            isCurrentWeek={formatISODate(monday) === formatISODate(mondayOfWeek(todayInSaoPaulo()))}
            labels={{
              previous: t("previousWeek"),
              next: t("nextWeek"),
              current: t("currentWeek"),
            }}
          />
        }
      />

      {/* De onde vêm as horas, dito na própria tela: sem isto, o número passa por apontamento e a
          leitura vira cobrança de tempo. */}
      <p className="mb-2 text-xs text-muted-foreground">{t("ruler")}</p>

      <SectionCard bodyClassName="overflow-x-auto p-0">
        {carga.clients.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground">
                  {t("client")}
                </th>
                {carga.days.map((d) => (
                  <th
                    key={d}
                    className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground"
                  >
                    {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carga.clients.map((c) => (
                <tr key={c.clientId}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-foreground">
                    {c.clientName}
                  </td>
                  {carga.days.map((d) => (
                    <td key={d} className="px-4 py-3 text-sm text-foreground">
                      {c.byDay[d].count === 0
                        ? "—"
                        : t("cell", {
                            hours: c.byDay[d].hours.toFixed(1),
                            count: c.byDay[d].count,
                          })}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-foreground">
                    {t("cell", { hours: c.totalHours.toFixed(1), count: c.totalCount })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

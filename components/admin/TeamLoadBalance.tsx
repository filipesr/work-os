import { getTeamMemberLoad, median, OVERLOAD_CEILING } from "@/lib/actions/team-health";
import { TeamLoadBalanceClient } from "@/components/admin/TeamLoadBalanceClient";

export default async function TeamLoadBalance() {
  const rows = await getTeamMemberLoad();
  const summary = {
    total: rows.length,
    overloaded: rows.filter((r) => r.overloaded).length,
    idle: rows.filter((r) => r.idle && !r.overloaded).length,
    medianWip: median(rows.map((r) => r.count)),
    ceiling: OVERLOAD_CEILING,
  };
  return <TeamLoadBalanceClient rows={rows} summary={summary} />;
}

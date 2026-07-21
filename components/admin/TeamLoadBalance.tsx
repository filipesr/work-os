import { getTeamMemberLoad, median } from "@/lib/actions/team-health";
import { TeamLoadBalanceClient } from "@/components/admin/TeamLoadBalanceClient";

export default async function TeamLoadBalance() {
  const rows = await getTeamMemberLoad();
  const summary = {
    total: rows.length,
    overloaded: rows.filter((r) => r.overloaded).length,
    idle: rows.filter((r) => r.idle && !r.overloaded).length,
    medianWip: median(rows.map((r) => r.count)),
  };
  return <TeamLoadBalanceClient rows={rows} summary={summary} />;
}

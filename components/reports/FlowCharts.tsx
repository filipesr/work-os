import type { CfdPoint, ThroughputPoint } from "@/lib/actions/reporting";

// Server-rendered SVG charts (no charting library, no client JS) for the P1
// time-series: a throughput trend line and a status-band Cumulative Flow
// Diagram. Both are pure presentational — data is fetched by the page sections.

const W = 640;
const H = 200;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;

export function ThroughputLine({ points, label }: { points: ThroughputPoint[]; label: string }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.count));
  const x = (i: number) =>
    PAD_L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - PAD_L - PAD_R));
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.count)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label}>
      <line
        x1={PAD_L}
        y1={y(0)}
        x2={W - PAD_R}
        y2={y(0)}
        stroke="currentColor"
        strokeOpacity={0.15}
      />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.count)} r={2.5} fill="#2563eb" />
      ))}
      <text x={PAD_L} y={y(max) - 2} fontSize={9} fill="currentColor" fillOpacity={0.5}>
        {max}
      </text>
    </svg>
  );
}

const BANDS: { key: keyof Omit<CfdPoint, "date">; color: string }[] = [
  // bottom → top: done accumulates at the base, waiting/backlog on top
  { key: "COMPLETED", color: "#059669" },
  { key: "ACTIVE", color: "#2563eb" },
  { key: "BLOCKED", color: "#e11d48" },
  { key: "INACTIVE", color: "#94a3b8" },
];

export function StatusCfd({
  points,
  labels,
}: {
  points: CfdPoint[];
  labels: Record<"COMPLETED" | "ACTIVE" | "BLOCKED" | "INACTIVE", string>;
}) {
  if (points.length === 0) return null;
  const totals = points.map((p) => p.COMPLETED + p.ACTIVE + p.BLOCKED + p.INACTIVE);
  const max = Math.max(1, ...totals);
  const x = (i: number) =>
    PAD_L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - PAD_L - PAD_R));
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);

  // Build stacked polygons: each band spans [cumBelow, cumBelow+value] per point.
  const cum = new Array(points.length).fill(0);
  const polys = BANDS.map((band) => {
    const top: string[] = [];
    const bottom: string[] = [];
    points.forEach((p, i) => {
      const below = cum[i];
      const above = below + (p[band.key] as number);
      top.push(`${x(i)},${y(above)}`);
      bottom.push(`${x(i)},${y(below)}`);
      cum[i] = above;
    });
    const d = `M${top.join(" L")} L${bottom.reverse().join(" L")} Z`;
    return { d, color: band.color, key: band.key };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="CFD">
        {polys.map((poly) => (
          <path key={poly.key} d={poly.d} fill={poly.color} fillOpacity={0.75} />
        ))}
        <text x={PAD_L} y={y(max) - 2} fontSize={9} fill="currentColor" fillOpacity={0.5}>
          {max}
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {BANDS.map((b) => (
          <span key={b.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: b.color }}
            />
            {labels[b.key]}
          </span>
        ))}
      </div>
    </div>
  );
}

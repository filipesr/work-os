import type { CfdPoint, ThroughputPoint } from "@/lib/actions/reporting";

// Server-rendered SVG charts (no charting library, no client JS) for the P1
// time-series: a throughput trend line and a status-band Cumulative Flow
// Diagram. Both are pure presentational — data is fetched by the page sections.

const W = 640;
const H = 210;
const PAD_L = 30; // room for Y-axis labels
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 26; // room for X-axis (date) labels

// ─── Axis helpers (shared by both charts) ────────────────────────────────────────

/** ISO date → "dd/MM" (UTC, locale-neutral — matches the bucket construction). */
export function fmtDayMonth(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** Up to `count` evenly-spaced indices across [0, n-1] (deduped). */
export function pickTickIndices(n: number, count: number): number[] {
  if (n <= 0) return [];
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < count; k++) out.push(Math.round((k / (count - 1)) * (n - 1)));
  return Array.from(new Set(out));
}

/** Y-axis tick values: 0, midpoint, max (integers, deduped). */
function yTickValues(max: number): number[] {
  if (max <= 1) return [0, Math.max(1, max)];
  return Array.from(new Set([0, Math.round(max / 2), max]));
}

export type XLabel = { i: number; text: string; anchor: "start" | "middle" | "end" };

export function xLabelsFor(dates: string[], count = 5): XLabel[] {
  return pickTickIndices(dates.length, count).map((i) => ({
    i,
    text: fmtDayMonth(dates[i]),
    anchor: i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle",
  }));
}

/** Draws Y gridlines + labels, the Y/X axis lines, and X (date) tick labels.
 * `yFn(yMax)` is the top edge, `yFn(0)` the baseline. */
function ChartAxes({
  yMax,
  yFn,
  xFn,
  xLabels,
}: {
  yMax: number;
  yFn: (v: number) => number;
  xFn: (i: number) => number;
  xLabels: XLabel[];
}) {
  return (
    <g>
      {yTickValues(yMax).map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            y1={yFn(v)}
            x2={W - PAD_R}
            y2={yFn(v)}
            stroke="currentColor"
            strokeOpacity={v === 0 ? 0.25 : 0.08}
          />
          <text
            x={PAD_L - 5}
            y={yFn(v) + 3}
            fontSize={9}
            textAnchor="end"
            fill="currentColor"
            fillOpacity={0.55}
          >
            {v}
          </text>
        </g>
      ))}
      <line
        x1={PAD_L}
        y1={yFn(yMax)}
        x2={PAD_L}
        y2={yFn(0)}
        stroke="currentColor"
        strokeOpacity={0.25}
      />
      {xLabels.map((l) => (
        <text
          key={l.i}
          x={xFn(l.i)}
          y={H - 7}
          fontSize={9}
          textAnchor={l.anchor}
          fill="currentColor"
          fillOpacity={0.55}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────────

export function ThroughputLine({ points, label }: { points: ThroughputPoint[]; label: string }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.count));
  const x = (i: number) =>
    PAD_L + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - PAD_L - PAD_R));
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.count)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label}>
      <ChartAxes yMax={max} yFn={y} xFn={x} xLabels={xLabelsFor(points.map((p) => p.weekStart))} />
      <path d={path} fill="none" stroke="#4f46e5" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.count)} r={2.5} fill="#4f46e5" />
      ))}
    </svg>
  );
}

const BANDS: { key: keyof Omit<CfdPoint, "date">; color: string }[] = [
  // bottom → top: done accumulates at the base, waiting/backlog on top
  { key: "COMPLETED", color: "#059669" },
  { key: "ACTIVE", color: "#4f46e5" },
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
        <ChartAxes yMax={max} yFn={y} xFn={x} xLabels={xLabelsFor(points.map((p) => p.date))} />
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

/** Scatterplot estático de cycle times com linhas de referência p50/p85/p95.
 * Server-rendered, sem lib. Eixos: X = data de conclusão (cronológica), Y = dias.
 * `ariaLabel` mantém o componente translator-agnóstico. */
export function CycleScatter({
  points,
  p50,
  p85,
  p95,
  ariaLabel,
}: {
  points: { days: number; at: string }[];
  p50: number;
  p85: number;
  p95: number;
  ariaLabel: string;
}) {
  const W = 320;
  const H = 160;
  const padL = 24; // room for Y-axis (days) labels
  const padR = 42; // room for percentile labels
  const padT = 8;
  const padB = 20; // room for X-axis (date) labels
  // Cap the y-axis so a rare outlier doesn't squash the bulk; clip above.
  const yMax = Math.max(p95 * 1.25, 1);
  // Oldest → newest left-to-right so the X axis reads chronologically.
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const x = (i: number) =>
    padL + (sorted.length <= 1 ? 0 : (i / (sorted.length - 1)) * (W - padL - padR));
  const y = (d: number) => padT + (1 - Math.min(d, yMax) / yMax) * (H - padT - padB);
  const line = (d: number, color: string, label: string, key: string) => (
    <g key={key}>
      <line
        x1={padL}
        y1={y(d)}
        x2={W - padR}
        y2={y(d)}
        stroke={color}
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      <text x={W - padR + 3} y={y(d) + 3} fontSize={9} fill={color}>
        {label} {d.toFixed(1)}d
      </text>
    </g>
  );
  const yTicks = Array.from(new Set([0, Math.round(yMax / 2), Math.round(yMax)]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {/* Y axis: days scale */}
      {yTicks.map((v) => (
        <text
          key={`y${v}`}
          x={padL - 4}
          y={y(v) + 3}
          fontSize={9}
          textAnchor="end"
          fill="currentColor"
          fillOpacity={0.55}
        >
          {v}d
        </text>
      ))}
      <line x1={padL} y1={y(yMax)} x2={padL} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} />
      <line
        x1={padL}
        y1={y(0)}
        x2={W - padR}
        y2={y(0)}
        stroke="currentColor"
        strokeOpacity={0.25}
      />
      {/* X axis: completion dates */}
      {xLabelsFor(
        sorted.map((p) => p.at),
        4
      ).map((l) => (
        <text
          key={`x${l.i}`}
          x={x(l.i)}
          y={H - 6}
          fontSize={9}
          textAnchor={l.anchor}
          fill="currentColor"
          fillOpacity={0.55}
        >
          {l.text}
        </text>
      ))}
      {line(p95, "#e11d48", "p95", "l95")}
      {line(p85, "#4f46e5", "p85", "l85")}
      {line(p50, "#0891b2", "p50", "l50")}
      {sorted.map((pt, i) => (
        <circle key={i} cx={x(i)} cy={y(pt.days)} r={2} fill="#64748b" fillOpacity={0.55} />
      ))}
    </svg>
  );
}

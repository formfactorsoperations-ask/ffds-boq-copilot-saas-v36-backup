import React from "react";
import { FullProjectData } from "../../types";
import { formatINR } from "../../lib/utils";
import { calculateProjectFinancials } from "../../lib/financialsUtils";

/**
 * PORTFOLIO ORBIT — the studio's book of work as a living field.
 *
 * The hero used to be a greeting and nothing else: a name, a count, and a lot
 * of empty space. This puts the actual portfolio there. Every live project is
 * a node, placed left to right by how far through the lifecycle it has got,
 * sized by what it is worth, coloured by which phase it is in.
 *
 * It is data, not decoration -- you can see at a glance that the book is
 * bottom-heavy with pipeline, or that one big job is carrying the quarter --
 * and every node opens its project.
 *
 * Positions are derived from the project id, not from Math.random, so a node
 * does not jump to a new place on every re-render.
 */

const PIPELINE = ["lead", "draft", "proposal_sent", "negotiation"];
const PHASES: { key: string; x: number; label: string; colour: string }[] = [
  { key: "pipeline",  x: 0.13, label: "Pipeline",  colour: "#E0A030" },
  { key: "won",       x: 0.42, label: "Won",       colour: "#0066CC" },
  { key: "execution", x: 0.68, label: "On site",   colour: "#3B82F6" },
  { key: "delivered", x: 0.92, label: "Delivered", colour: "#0E7C5A" },
];

const phaseOf = (status: string): string | null => {
  if (PIPELINE.includes(status)) return "pipeline";
  if (status === "won") return "won";
  if (status === "execution" || status === "work_paused") return "execution";
  if (status === "completed") return "delivered";
  return null; // lost / archived never appear
};

/** Stable pseudo-random in [0,1) from a string, so nodes hold their place. */
const hash01 = (str: string, salt = 0): number => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
};

interface Node {
  id: string;
  cx: number;
  cy: number;
  r: number;
  colour: string;
  name: string;
  value: number;
  phase: string;
  dur: number;
  delay: number;
  project: FullProjectData;
}

const W = 470;
const H = 210;

interface Props {
  projects: FullProjectData[];
  onOpenProject: (p: FullProjectData, tab?: string) => void;
}

const PortfolioOrbit: React.FC<Props> = ({ projects, onOpenProject }) => {
  const [hover, setHover] = React.useState<Node | null>(null);

  const nodes: Node[] = React.useMemo(() => {
    const out: Node[] = [];
    for (const p of projects || []) {
      const status = p.context?.status || "";
      const phase = phaseOf(status);
      if (!phase) continue;

      const tier =
        (p.tiers || []).find((t) => t.id === (p.activeTierId || (p.context as any)?.approvedTierId)) ||
        (p.tiers || [])[0];
      let value = 0;
      try {
        const fin = calculateProjectFinancials(p.context, tier) as any;
        value = (fin?.taxableExecution || 0) + (fin?.taxableDesign || 0);
      } catch {
        value = 0;
      }

      const band = PHASES.find((f) => f.key === phase)!;
      // Jitter around the phase column so equal-stage projects do not stack.
      // Wider scatter where a phase is crowded, so 20 pipeline jobs read as
      // a field rather than a blob.
      const jx = (hash01(p.id, 1) - 0.5) * 0.17;
      const jy = 0.10 + hash01(p.id, 2) * 0.74;

      out.push({
        id: p.id,
        cx: (band.x + jx) * W,
        cy: jy * H,
        // sqrt keeps one large job from dwarfing the field entirely
        r: 3.5 + Math.min(1, Math.sqrt(value) / 1600) * 8,
        colour: band.colour,
        name: p.context?.name || "Unnamed project",
        value,
        phase: band.label,
        dur: 7 + hash01(p.id, 3) * 7,
        delay: hash01(p.id, 4) * 3,
        project: p,
      });
    }
    return out.sort((a, b) => b.r - a.r);
  }, [projects]);

  if (nodes.length === 0) return null;

  return (
    <div className="relative w-full max-w-[460px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={`${nodes.length} live projects across the lifecycle`}
      >
        {/* Phase guides — the field reads as a flow, not a scatter. */}
        {PHASES.map((f) => (
          <g key={f.key}>
            <line
              x1={f.x * W} y1={10} x2={f.x * W} y2={H - 16}
              stroke={f.colour} strokeOpacity={0.16} strokeWidth={1} strokeDasharray="2 5"
            />
            <text
              x={f.x * W} y={H - 2} textAnchor="middle"
              className="fill-slate-400"
              style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}
            >
              {f.label}
            </text>
          </g>
        ))}

        {nodes.map((n, i) => {
          const active = hover?.id === n.id;
          return (
            <g
              key={n.id}
              className="orbit-node cursor-pointer"
              style={{ ["--dur" as any]: `${n.dur}s`, animationDelay: `${n.delay}s` }}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover((h) => (h?.id === n.id ? null : h))}
              onClick={() => onOpenProject(n.project)}
            >
              <g className="orbit-in" style={{ animationDelay: `${200 + i * 45}ms` }}>
                <circle
                  cx={n.cx} cy={n.cy} r={n.r * 1.75}
                  fill={n.colour}
                  className="orbit-halo"
                  style={{ ["--dur" as any]: `${n.dur}s`, animationDelay: `${n.delay}s` }}
                />
                <circle
                  cx={n.cx} cy={n.cy} r={active ? n.r * 1.3 : n.r}
                  fill={n.colour}
                  stroke="#fff"
                  strokeWidth={active ? 2 : 1.2}
                  style={{ transition: "r .18s ease, stroke-width .18s ease" }}
                />
              </g>
            </g>
          );
        })}
      </svg>

      {/* Tooltip. Above the field, not below it: at the bottom the card sat
          on top of the "Pipeline" phase label and hid it. */}
      <div
        className={`pointer-events-none absolute left-0 -top-8 z-20 transition-all duration-200 ${
          hover ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
      >
        {hover && (
          <div className="rounded-lg bg-slate-900/92 backdrop-blur-sm px-2.5 py-1.5 shadow-lg">
            <p className="text-[11px] font-semibold text-white leading-tight">{hover.name}</p>
            <p className="text-[10px] text-slate-300 mt-0.5">
              {hover.phase}
              {hover.value > 0 && <span className="text-slate-400"> · {formatINR(hover.value)}</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioOrbit;

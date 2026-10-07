import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fileBlob } from '../../services/drawingReviewService';
import { loadPdf, renderPage } from '../../lib/pdfRender';
import { turnShape, type MarkShape, type ReviewMark, type Turn } from '../../lib/drawingReview';
import { MARK, FIXED } from './ui';

/*
  One page of a drawing, with the review marks drawn over it.

  Marks are stored as fractions of the page, so the overlay is an SVG whose
  box is the page: 1000 units wide and as tall as the page's proportions.
  Whatever the zoom, a pin at (0.5, 0.35) is half-way across and a third of
  the way down the sheet.
*/

export type Tool = 'select' | 'pin' | 'rect' | 'arrow' | 'pen';

interface Props {
  pdfPath: string;
  comparePath?: string | null;
  compareLabel?: [string, string];
  page: number;
  zoom: number;
  marks: ReviewMark[];
  draft?: MarkShape | null;
  selectedId?: string | null;
  tool: Tool;
  canMark: boolean;
  /** The viewer's own rotation of the sheet; marks are drawn turned and saved unturned. */
  turn?: Turn;
  onPageCount?: (n: number) => void;
  onSelect?: (id: string) => void;
  onShape?: (shape: MarkShape, anchor: { x: number; y: number }) => void;
}

/* `mode` changes when the canvas element is swapped (compare on or off), so the page is drawn again into the new one. */
function useCanvasPage(path: string | null | undefined, page: number, width: number, mode: string, turn: Turn) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    if (!path || !canvas.current || width < 50) return;
    setError(null);
    loadPdf(path, async () => (await fileBlob(path)).arrayBuffer())
      .then(async (doc) => {
        if (!live) return;
        setPages(doc.numPages);
        const s = await renderPage(doc, page, canvas.current!, width, turn);
        if (live) setSize(s);
      })
      .catch((e) => live && setError(/unauthori|permission/i.test(String(e?.code || e?.message)) ? 'You cannot open this drawing.' : 'This drawing could not be opened. Check the connection and try again.'));
    return () => { live = false; };
  }, [path, page, width, mode, turn]);
  return { canvas, size, error, pages };
}

export function MarkShapeSvg({ m, n, color, selected, H }: { m: MarkShape; n: number | string; color: string; selected?: boolean; H: number }) {
  const X = (v: number) => v * 1000;
  const Y = (v: number) => v * H;
  const sw = selected ? 4.5 : 3;
  const tag = (x: number, y: number) => (
    <g>
      <circle cx={x} cy={y} r={15} fill={color} stroke="#fff" strokeWidth={3} />
      <text x={x} y={y + 5} fontSize={15} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif">{n}</text>
    </g>
  );
  if (m.t === 'pin') return tag(X(m.x), Y(m.y));
  if (m.t === 'rect') return <g><rect x={X(m.x)} y={Y(m.y)} width={X(m.w)} height={Y(m.h)} rx={5} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={sw} />{tag(X(m.x + m.w), Y(m.y))}</g>;
  if (m.t === 'arrow') {
    const x1 = X(m.x), y1 = Y(m.y), x2 = X(m.x2), y2 = Y(m.y2);
    const a = Math.atan2(y2 - y1, x2 - x1), L = 18;
    const p1 = `${x2 - L * Math.cos(a - 0.45)},${y2 - L * Math.sin(a - 0.45)}`;
    const p2 = `${x2 - L * Math.cos(a + 0.45)},${y2 - L * Math.sin(a + 0.45)}`;
    return <g><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} strokeLinecap="round" /><path d={`M${x2},${y2} L${p1} L${p2} Z`} fill={color} />{tag(x1, y1)}</g>;
  }
  if (m.t === 'pen') {
    const d = m.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)},${Y(y)}`).join(' ');
    return <g><path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />{tag(X(m.pts[0][0]), Y(m.pts[0][1]))}</g>;
  }
  return null;
}

export default function PdfStage(props: Props) {
  const { pdfPath, comparePath, compareLabel, page, zoom, marks, draft, selectedId, tool, canMark, onPageCount, onSelect, onShape } = props;
  const turn: Turn = props.turn || 0;
  const wrap = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useLayoutEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(Math.floor(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const width = Math.max(200, Math.min(boxWidth, 1100) * zoom);
  const mode = comparePath ? 'compare' : 'single';
  const main = useCanvasPage(pdfPath, page, width, mode, turn);
  const other = useCanvasPage(comparePath || null, page, width, mode, turn);
  const [cmpX, setCmpX] = useState(50);
  useEffect(() => { if (main.pages) onPageCount?.(main.pages); }, [main.pages]);

  const H = main.size ? (1000 * main.size.height) / main.size.width : 707;
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<MarkShape | null>(null);
  const start = useRef<[number, number] | null>(null);

  const point = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const drawing = canMark && tool !== 'select' && !comparePath;
  const down = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = point(e);
    if (tool === 'pin') { onShape?.(turnShape({ t: 'pin', x: p[0], y: p[1] }, turn, 'page'), { x: p[0], y: p[1] }); return; }
    start.current = p;
    setLive(tool === 'rect' ? { t: 'rect', x: p[0], y: p[1], w: 0, h: 0 } : tool === 'arrow' ? { t: 'arrow', x: p[0], y: p[1], x2: p[0], y2: p[1] } : { t: 'pen', pts: [p] });
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current || !live) return;
    const p = point(e), s = start.current;
    if (live.t === 'rect') setLive({ t: 'rect', x: Math.min(s[0], p[0]), y: Math.min(s[1], p[1]), w: Math.abs(p[0] - s[0]), h: Math.abs(p[1] - s[1]) });
    else if (live.t === 'arrow') setLive({ ...live, x2: p[0], y2: p[1] });
    else if (live.t === 'pen' && live.pts.length < 600) setLive({ t: 'pen', pts: [...live.pts, p] });
  };
  const up = () => {
    const s = live; start.current = null; setLive(null);
    if (!s) return;
    const big = s.t === 'rect' ? s.w > 0.01 && s.h > 0.01 : s.t === 'arrow' ? Math.hypot(s.x2 - s.x, s.y2 - s.y) > 0.02 : s.t === 'pen' ? s.pts.length > 4 : true;
    if (!big) return;
    const anchor = s.t === 'rect' ? { x: s.x + s.w, y: s.y } : s.t === 'arrow' ? { x: s.x, y: s.y } : s.t === 'pen' ? { x: s.pts[0][0], y: s.pts[0][1] } : { x: 0, y: 0 };
    onShape?.(turnShape(s, turn, 'page'), anchor);
  };

  const error = main.error || other.error;
  return (
    <div ref={wrap} className="flex w-full justify-center">
      <div className="relative" style={{ width: main.size?.width || width, minHeight: main.size ? undefined : width * 0.7 }}>
        <div className="relative overflow-hidden rounded-[3px] bg-white" style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.2)' }}>
          {comparePath ? (
            <>
              <canvas ref={other.canvas} className="block" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${cmpX}%)` }}><canvas ref={main.canvas} className="block" /></div>
              <span className="pointer-events-none absolute bottom-0 top-0 w-0.5" style={{ left: `${cmpX}%`, background: MARK }}>
                <span className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: MARK, boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>⇆</span>
              </span>
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-[#14211E] px-1.5 font-mono text-[10.5px] font-semibold text-white">{compareLabel?.[0]}</span>
              <span className="pointer-events-none absolute right-2 top-2 rounded px-1.5 font-mono text-[10.5px] font-semibold text-white" style={{ background: MARK }}>{compareLabel?.[1]}</span>
              <input type="range" min={0} max={100} value={cmpX} onChange={(e) => setCmpX(+e.target.value)} aria-label="Slide between the two versions"
                className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
            </>
          ) : (
            <>
              <canvas ref={main.canvas} className="block" />
              {main.size && (
                <svg ref={svg} viewBox={`0 0 1000 ${H}`} className="absolute inset-0 h-full w-full" style={{ cursor: drawing ? 'crosshair' : 'default', touchAction: 'none' }}
                  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setLive(null); }}>
                  {marks.map((m) => (
                    <g key={m.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => { if (!drawing) { e.stopPropagation(); onSelect?.(m.id); } }}>
                      <MarkShapeSvg m={turnShape(m.shape, turn, 'view')} n={m.n} H={H} color={m.status === 'FIXED' ? FIXED : MARK} selected={selectedId === m.id} />
                    </g>
                  ))}
                  {draft && <MarkShapeSvg m={turnShape(draft, turn, 'view')} n="+" H={H} color={MARK} selected />}
                  {live && <MarkShapeSvg m={live} n="+" H={H} color={MARK} selected />}
                </svg>
              )}
            </>
          )}
          {!main.size && !error && (
            <div className="absolute inset-0 grid place-items-center text-sm text-slate-500"><Loader2 className="animate-spin" size={22} /></div>
          )}
          {error && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-600">{error}</div>}
        </div>
      </div>
    </div>
  );
}

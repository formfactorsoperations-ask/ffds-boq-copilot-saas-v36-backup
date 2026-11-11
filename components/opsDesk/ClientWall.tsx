import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from '@/lib/lucide-shim';
import type { Health } from '../../lib/opsDesk2';
import { HEALTH_PILL } from '../../lib/opsDesk2';
import './od2Styles';

/*
  THE CLIENT WALL (Ops Desk 2.1, after the curved carousel the owner shared).

  Every live project as a frosted card on one curved wall: its stage, its
  health, its client, the next thing to do and how far along it is. It drifts
  on its own, can be dragged or flicked, steps with the arrows, and Space
  pauses it; a tap (or Enter) opens the client in the middle. The cards are
  drawn once onto a strip and the strip is bent column by column, so even a
  long wall stays smooth. Nothing moves under reduced motion.
*/

export interface WallItem {
  id: string;
  name: string;
  client: string;
  /** "3 BHK · Powai" */
  line: string;
  /** "EXECUTION" eyebrow. */
  stage: string;
  phaseIndex: number;
  health: Health;
  progress: number;
  next: string;
}

const PHASE_TINT = ['rgba(61,82,160,.12)', 'rgba(61,82,160,.18)', 'rgba(61,82,160,.22)', 'rgba(61,82,160,.26)', 'rgba(16,185,129,.22)'];
const K = {
  card: 'rgba(255,255,255,.42)', edge: 'rgba(255,255,255,.95)', chip: 'rgba(255,255,255,.8)', sheen: 'rgba(255,255,255,.65)',
  ink: '#1E293B', ink2: '#334155', muted: '#64748B', brand: '#3D52A0', tint: 'rgba(61,82,160,.18)', line: '#E2E8F0',
  good: '#10B981', warn: '#F59E0B', bad: '#F43F5E',
};
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fontOf = () => (typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : '') || 'ui-sans-serif, system-ui, sans-serif';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = String(text).split(' ');
  let line = '', lines = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(t).width > maxW && line) {
      if (lines === maxLines - 1) {
        while (ctx.measureText(`${line}…`).width > maxW && line.length) line = line.slice(0, -1);
        ctx.fillText(`${line}…`, x, y + lines * lh); return;
      }
      ctx.fillText(line, x, y + lines * lh); lines++; line = words[i];
    } else line = t;
  }
  ctx.fillText(line, x, y + lines * lh);
}
function seeded(i: number) { let s = (i + 1) * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function pill(ctx: CanvasRenderingContext2D, font: string, x: number, y: number, text: string, dot: string) {
  ctx.font = `700 10px ${font}`; const tw = ctx.measureText(text).width + 24;
  rr(ctx, x - tw, y, tw, 20, 10); ctx.fillStyle = K.chip; ctx.fill();
  ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x - tw + 11, y + 10, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = K.ink2; ctx.textAlign = 'left'; ctx.fillText(text, x - tw + 18, y + 14);
}

/* A client card: frosted glass, a floor plan in faint lines, health and progress. */
function paintClient(ctx: CanvasRenderingContext2D, font: string, x: number, w: number, h: number, c: WallItem, i: number) {
  const R = 22, pad = 16;
  ctx.save(); rr(ctx, x, 0, w, h, R); ctx.clip();
  ctx.fillStyle = K.card; ctx.fillRect(x, 0, w, h);
  const pg = ctx.createRadialGradient(x + w * 0.12, h * 0.04, 0, x + w * 0.12, h * 0.04, w * 1.05);
  pg.addColorStop(0, PHASE_TINT[c.phaseIndex] || PHASE_TINT[1]); pg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = pg; ctx.fillRect(x, 0, w, h);
  const sh = ctx.createLinearGradient(x, 0, x + w * 0.9, h * 0.7);
  sh.addColorStop(0, K.sheen); sh.addColorStop(0.42, 'rgba(255,255,255,0)'); ctx.fillStyle = sh; ctx.fillRect(x, 0, w, h);
  /* The floor plan, different for each card. */
  const rnd = seeded(i);
  const px = x + w * 0.1, py = h * 0.19, pw = w * 0.8, ph = h * 0.3;
  ctx.strokeStyle = K.tint; ctx.lineWidth = 1.4; rr(ctx, px, py, pw, ph, 4); ctx.stroke(); ctx.lineWidth = 1;
  const vx = px + pw * (0.35 + rnd() * 0.3), hy = py + ph * (0.4 + rnd() * 0.25);
  ctx.beginPath(); ctx.moveTo(vx, py); ctx.lineTo(vx, py + ph); ctx.moveTo(px, hy); ctx.lineTo(vx, hy);
  const yy = py + ph * (0.55 + rnd() * 0.2); ctx.moveTo(vx, yy); ctx.lineTo(px + pw, yy); ctx.stroke();
  ctx.beginPath(); ctx.arc(vx, hy + 14, 14, -Math.PI / 2, 0); ctx.stroke();
  ctx.fillStyle = K.muted; ctx.font = `600 9px ${font}`; ctx.textAlign = 'center';
  ctx.fillText(c.line || ' ', px + pw / 2, py + ph + 15, pw);
  ctx.textAlign = 'left';
  ctx.fillStyle = K.brand; ctx.font = `800 9px ${font}`;
  ctx.fillText(c.stage.toUpperCase().split('').join(String.fromCharCode(8202)), x + pad, 28, w - pad * 2 - 84);
  const hc = c.health === 'bad' ? K.bad : c.health === 'warn' ? K.warn : K.good;
  pill(ctx, font, x + w - pad + 4, 14, HEALTH_PILL[c.health], hc);
  ctx.fillStyle = K.ink; ctx.font = `800 19px ${font}`; wrapText(ctx, c.name, x + pad, h * 0.66, w - pad * 2, 21, 1);
  ctx.fillStyle = K.muted; ctx.font = `600 12px ${font}`; ctx.fillText(c.client || ' ', x + pad, h * 0.66 + 18, w - pad * 2);
  ctx.fillStyle = K.ink2; ctx.font = `600 11px ${font}`; wrapText(ctx, c.next, x + pad, h * 0.66 + 38, w - pad * 2, 14, 2);
  const by = h - 20;
  rr(ctx, x + pad, by, w - pad * 2 - 36, 5, 3); ctx.fillStyle = K.line; ctx.fill();
  rr(ctx, x + pad, by, Math.max(5, (w - pad * 2 - 36) * c.progress / 100), 5, 3); ctx.fillStyle = hc; ctx.fill();
  ctx.fillStyle = K.ink; ctx.font = `800 11px ${font}`; ctx.textAlign = 'right'; ctx.fillText(`${c.progress}%`, x + w - pad, by + 6);
  ctx.restore();
  ctx.save(); rr(ctx, x + 0.75, 0.75, w - 1.5, h - 1.5, R); ctx.strokeStyle = K.edge; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  ctx.save(); rr(ctx, x + 0.25, 0.25, w - 0.5, h - 0.5, R); ctx.strokeStyle = K.line; ctx.lineWidth = 0.5; ctx.stroke(); ctx.restore();
}

interface WallApi { step: (dir: number) => void; togglePause: () => boolean; center: () => WallItem | undefined; destroy: () => void; refresh: (items: WallItem[]) => void }

function createWall(o: { host: HTMLDivElement; canvas: HTMLCanvasElement; items: WallItem[]; cardW: number; cardH: number; onCenter: (c: WallItem, i: number, n: number) => void; onPick: (c: WallItem) => void }): WallApi {
  const { host, canvas: cv } = o;
  const CARD_W = o.cardW, CARD_H = o.cardH, GAP = 30, CURVE = 0.45, SPEED = 26, MOMENTUM = 0.92;
  const m = { offset: 0, velocity: 0, pointer: -1, x: 0, time: 0, resume: 0, moved: 0, paused: false, tween: null as null | { from: number; to: number; t0: number } };
  let W = 0, H = 0, w = 0, h = 0, pitch = 0, total = 0, proj: Float64Array | null = null, atlas: HTMLCanvasElement | null = null, aScale = 1;
  let base = o.items, list = base, mid = -1, alive = true, raf = 0;
  const font = fontOf();
  const mod = (v: number, t: number) => ((v % t) + t) % t;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  function geometry() {
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
    const scale = Math.min(1, Math.max(120, W * 0.64) / CARD_W, Math.max(110, H - 56) / CARD_H);
    w = Math.max(80, CARD_W * scale); h = Math.max(90, CARD_H * scale); pitch = w + Math.max(8, GAP * scale);
    list = base.slice(); if (!list.length) { total = 0; return; }
    while (list.length * pitch < W + pitch * 2) list = list.concat(base);
    total = list.length * pitch;
    const cols = Math.ceil(W); proj = new Float64Array(cols * 4);
    const half = Math.max(260, W / 2), persp = Math.max(900, W * 1.15), lift = Math.min(CURVE * 120, Math.max(0, (H - h) / 2 + 16));
    const arc = (x: number) => x * (1 + CURVE * 0.2 * Math.pow(x / half, 2));
    for (let c = 0; c < cols; c++) {
      const x = c - W / 2, n = (x + 0.5) / half, p = persp / (persp + CURVE * 210 * n * n), i = c * 4;
      proj[i] = arc(x) + w / 2; proj[i + 1] = arc(x + 1) - arc(x); proj[i + 2] = H / 2 - lift * n * n - h * 0.5 * p; proj[i + 3] = h * p;
    }
  }
  function paint() {
    if (!total) { const ctx = cv.getContext('2d'); ctx?.clearRect(0, 0, cv.width, cv.height); return; }
    const a = document.createElement('canvas');
    aScale = Math.min(2, 8192 / Math.max(1, total), 2048 / Math.max(1, h));
    a.width = Math.max(1, Math.round(total * aScale)); a.height = Math.max(1, Math.round(h * aScale));
    const ctx = a.getContext('2d'); if (!ctx) return;
    ctx.setTransform(aScale, 0, 0, aScale, 0, 0);
    list.forEach((c, i) => paintClient(ctx, font, i * pitch, w, h, c, i % base.length));
    atlas = a; mid = -1; draw();
  }
  function draw() {
    if (!atlas || !proj || !total || !host.isConnected) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw) cv.width = pw; if (cv.height !== ph) cv.height = ph;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (let x = 0, i = 0; i < proj.length; x++, i += 4) {
      const src = mod(proj[i] - m.offset, total), span = proj[i + 1], first = Math.min(span, total - src), dst = first / span;
      ctx.drawImage(atlas, src * aScale, 0, first * aScale, atlas.height, x, proj[i + 2], dst + 0.12, proj[i + 3]);
      if (first < span) ctx.drawImage(atlas, 0, 0, (span - first) * aScale, atlas.height, x + dst, proj[i + 2], 1 - dst + 0.12, proj[i + 3]);
    }
    const idx = Math.floor(mod(w / 2 - m.offset, total) / pitch) % list.length;
    if (idx !== mid) { mid = idx; o.onCenter(list[idx], idx % base.length, base.length); }
  }
  function hit(cx: number, cy: number): WallItem | null {
    const r = cv.getBoundingClientRect(); const col = Math.floor(cx - r.left), y = cy - r.top;
    if (!proj || col < 0 || col >= W) return null;
    const i = col * 4; if (y < proj[i + 2] || y > proj[i + 2] + proj[i + 3]) return null;
    const src = mod(proj[i] - m.offset, total), idx = Math.floor(src / pitch);
    return src - idx * pitch <= w ? list[idx % list.length] : null;
  }
  function step(dir: number) { if (!total) return; m.tween = { from: m.offset, to: m.offset - dir * pitch, t0: performance.now() }; m.velocity = 0; m.resume = performance.now() + 2200; }
  let last = 0;
  function tick(now: number) {
    if (!alive || !host.isConnected) return;
    const dt = last ? Math.min(0.04, (now - last) / 1000) : 1 / 60; last = now;
    if (total) {
      if (m.tween) {
        const k = Math.min(1, (now - m.tween.t0) / 450), e = 1 - Math.pow(1 - k, 3);
        m.offset = mod(m.tween.from + (m.tween.to - m.tween.from) * e, total); if (k >= 1) m.tween = null; draw();
      } else if (m.pointer < 0) {
        const still = reduced();
        const auto = !m.paused && !still && now > m.resume;
        m.velocity = still ? 0 : m.velocity + ((auto ? -SPEED : 0) - m.velocity) * (1 - Math.pow(MOMENTUM, dt * 60));
        if (Math.abs(m.velocity) > 0.01) { m.offset = mod(m.offset + m.velocity * dt, total); draw(); }
      }
    }
    raf = requestAnimationFrame(tick);
  }
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    Object.assign(m, { pointer: e.pointerId, x: e.clientX, time: performance.now(), velocity: 0, moved: 0, tween: null });
    host.setPointerCapture?.(e.pointerId); host.classList.add('drag');
  };
  const move = (e: PointerEvent) => {
    if (m.pointer !== e.pointerId) { host.style.cursor = hit(e.clientX, e.clientY) ? 'pointer' : ''; return; }
    const now = performance.now(), dx = e.clientX - m.x; m.moved += Math.abs(dx);
    if (total) m.offset = mod(m.offset + dx, total);
    m.velocity = clamp(0.35 * m.velocity + 0.65 * dx / (Math.max(8, now - m.time) / 1000), -2200, 2200); m.x = e.clientX; m.time = now; draw();
  };
  const release = (e: PointerEvent) => {
    if (m.pointer !== e.pointerId) return;
    if (e.type !== 'pointerup' || performance.now() - m.time > 100 || reduced()) m.velocity = 0;
    m.pointer = -1; m.resume = performance.now() + 1500; host.classList.remove('drag');
    if (e.type === 'pointerup' && m.moved < 6) { const c = hit(e.clientX, e.clientY); if (c) o.onPick(c); }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); }
    else if (e.key === ' ') { e.preventDefault(); api.togglePause(); }
    else if (e.key === 'Enter' && list[mid]) o.onPick(list[mid]);
  };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', release); host.addEventListener('pointercancel', release); host.addEventListener('keydown', key);
  let rz = 0;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { window.clearTimeout(rz); rz = window.setTimeout(() => { geometry(); paint(); }, 80); }) : null;
  ro?.observe(host);
  const api: WallApi = {
    step,
    togglePause() { m.paused = !m.paused; return m.paused; },
    center() { return list[mid]; },
    refresh(items) { base = items; m.offset = 0; geometry(); paint(); },
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro?.disconnect();
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', release); host.removeEventListener('pointercancel', release); host.removeEventListener('keydown', key);
    },
  };
  geometry(); paint(); raf = requestAnimationFrame(tick);
  return api;
}

export interface WallFilter { id: string; label: string }

/** The band with the wall in it: title, filters, the arrows and pause, the wall, and who is in the middle. */
export function ClientWall({ title, sub, items, filters, filter, onFilter, onOpen, right, tall, tour }: {
  title: string; sub: string; items: WallItem[]; filters?: WallFilter[]; filter?: string; onFilter?: (id: string) => void;
  onOpen: (id: string) => void; right?: React.ReactNode; tall?: boolean; tour?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const api = useRef<WallApi | null>(null);
  const [mid, setMid] = useState<{ c: WallItem; i: number; n: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const pick = useRef(onOpen); pick.current = onOpen;
  const key = items.map((c) => `${c.id}:${c.health}:${c.progress}:${c.next}`).join('|');

  useEffect(() => {
    if (!host.current || !cv.current) return;
    if (!api.current) {
      api.current = createWall({
        host: host.current, canvas: cv.current, items, cardW: tall ? 260 : 240, cardH: tall ? 340 : 318,
        onCenter: (c, i, n) => setMid({ c, i, n }), onPick: (c) => pick.current(c.id),
      });
    } else api.current.refresh(items);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { api.current?.destroy(); api.current = null; }, []);

  return (
    <section className="od-band od-rise" style={{ ['--d' as any]: 1 }} aria-label="Client wall" data-tour={tour}>
      <div className="od-band-h">
        <div className="min-w-0"><span className="od-eyebrow">Clients</span><h2>{title}</h2><p>{sub}</p></div>
        <div className="od-r">
          {filters && onFilter && (
            <div className="od-filters" role="group" aria-label="Show">
              {filters.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>{f.label}</button>)}
            </div>
          )}
          {right}
          <button type="button" className="od-ib" aria-label="Previous client" onClick={() => api.current?.step(-1)}><ChevronLeft /></button>
          <button type="button" className="od-ib" aria-label={paused ? 'Play the wall' : 'Pause the wall'} onClick={() => setPaused(!!api.current?.togglePause())}>{paused ? <Play /> : <Pause />}</button>
          <button type="button" className="od-ib" aria-label="Next client" onClick={() => api.current?.step(1)}><ChevronRight /></button>
        </div>
      </div>
      {items.length ? (
        <>
          <div ref={host} className={`od-wall ${tall ? 'tall' : ''}`} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Client wall" aria-describedby="od-wall-help">
            <canvas ref={cv} aria-hidden />
            <p className="od-sr" id="od-wall-help">Drag left or right, or use the arrow keys. Space pauses. Enter opens the client in the middle.</p>
          </div>
          <div className="od-wall-foot">
            <span>In the middle: <b>{mid?.c.name || items[0].name}</b> · {mid?.c.client || items[0].client}</span>
            <span className="od-bar"><i style={{ width: `${100 / Math.max(1, mid?.n || items.length)}%`, transform: `translateX(${(mid?.i || 0) * 100}%)` }} /></span>
            <button type="button" className="od-btn sm pri" onClick={() => { const c = api.current?.center() || items[0]; if (c) onOpen(c.id); }}>Open client</button>
          </div>
          <ul className="od-sr">{items.map((c) => <li key={c.id}>{c.name}, {c.client}: {HEALTH_PILL[c.health]}, {c.progress}% done. Next: {c.next}</li>)}</ul>
        </>
      ) : (
        <div className="px-5 pb-5"><div className="od-empty2">No clients here.</div></div>
      )}
    </section>
  );
}

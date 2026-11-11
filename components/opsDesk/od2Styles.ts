/*
  OPS DESK 2.1: the look (DESIGN.md → "Ops Desk 2.1").

  The studio owner approved the Ops Desk 2.1 mockup on 11 Nov 2026: light
  bands with a brand glow, frosted cards, rings, the client wall and the
  focus stack. Same font (the app's, never set here), the brand #3D52A0,
  slate, and rose/amber/emerald for state; light only. Every class is
  prefixed `od-` and sits under `.od2`, so nothing here reaches another tab
  and no global class reaches in. Every animation stops under
  prefers-reduced-motion.

  Like peopleStyles.ts, the styles ship inside this module and are added to
  the page once, when it is first imported, so a sync that leaves a .css
  file behind cannot strip the desk of its look.
*/
const OD2_CSS = `
.od2 {
  --od-bg: #F3F5FA; --od-surface: #FFFFFF; --od-surface-2: #F7F8FC; --od-line: #E2E8F0; --od-line-2: #CBD5E1;
  --od-ink: #1E293B; --od-ink-2: #334155; --od-muted: #64748B; --od-faint: #94A3B8;
  --od-brand: #3D52A0; --od-brand-hover: #334486; --od-brand-tint: rgba(61,82,160,.10); --od-brand-tint-2: rgba(61,82,160,.18); --od-brand-glow: rgba(61,82,160,.28);
  --od-navy: #12182F;
  --od-good: #047857; --od-good-bg: #D1FAE5; --od-good-dot: #10B981;
  --od-warn: #B45309; --od-warn-bg: #FEF3C7; --od-warn-dot: #F59E0B;
  --od-bad: #BE123C; --od-bad-bg: #FFE4E6; --od-bad-dot: #F43F5E;
  --od-lb-a: rgba(61,82,160,.12); --od-lb-b: rgba(124,143,224,.22); --od-lb-line: rgba(61,82,160,.14); --od-lb-fill: rgba(255,255,255,.62); --od-lb-fill-2: rgba(255,255,255,.85);
  --od-glass-edge: rgba(255,255,255,.95);
  --od-shadow: 0 1px 2px rgba(18,24,47,.05), 0 10px 28px -16px rgba(18,24,47,.22);
  --od-shadow-lg: 0 30px 70px -28px rgba(18,24,47,.5);
  --od-r-card: 20px; --od-r-ctl: 12px;
  color: var(--od-ink); line-height: 1.45;
}
.od2 *, .od-ov * { box-sizing: border-box; }
.od2 .od-num, .od-ov .od-num { font-variant-numeric: tabular-nums; }
.od2 button, .od-ov button { cursor: pointer; }
.od2 :focus-visible, .od-ov :focus-visible { outline: 2px solid var(--od-brand); outline-offset: 2px; }
.od-ov { --od-surface: #FFFFFF; --od-surface-2: #F7F8FC; --od-line: #E2E8F0; --od-line-2: #CBD5E1; --od-ink: #1E293B; --od-ink-2: #334155; --od-muted: #64748B; --od-faint: #94A3B8;
  --od-brand: #3D52A0; --od-brand-hover: #334486; --od-brand-tint: rgba(61,82,160,.10); --od-brand-tint-2: rgba(61,82,160,.18); --od-brand-glow: rgba(61,82,160,.28); --od-navy: #12182F;
  --od-good-dot: #10B981; --od-warn-dot: #F59E0B; --od-bad-dot: #F43F5E; --od-shadow-lg: 0 30px 70px -28px rgba(18,24,47,.5); color: var(--od-ink); }

/* ── Shell ── */
.od-shell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
@media (min-width: 1024px) { .od-shell { grid-template-columns: 236px minmax(0, 1fr); } }
.od-main { min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.od-rail { display: flex; gap: 2px; padding: 10px; border-radius: var(--od-r-card); background: var(--od-surface); border: 1px solid var(--od-line); box-shadow: var(--od-shadow); overflow-x: auto; scrollbar-width: none; }
.od-rail::-webkit-scrollbar { display: none; }
@media (min-width: 1024px) { .od-rail { position: sticky; top: 16px; align-self: start; flex-direction: column; overflow: visible; } }
.od-rail h4 { display: none; margin: 10px 10px 4px; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--od-faint); }
@media (min-width: 1024px) { .od-rail h4 { display: block; } }
.od-rail button { position: relative; display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 10px; border-radius: 12px; font-weight: 600; font-size: 13px; color: var(--od-ink-2); text-align: left; white-space: nowrap; flex-shrink: 0; transition: background .15s, color .15s; }
.od-rail button svg { width: 16px; height: 16px; color: var(--od-faint); flex-shrink: 0; position: relative; }
.od-rail button span { position: relative; }
.od-rail button:hover { background: var(--od-brand-tint); }
.od-rail button.on { color: #fff; }
.od-rail button.on svg { color: #fff; }
.od-rail .od-rail-on { position: absolute; inset: 0; border-radius: 12px; background: var(--od-brand); box-shadow: 0 8px 18px -10px var(--od-brand-glow); }
.od-rail .od-badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; font-size: 10px; font-weight: 800; display: grid; place-items: center; background: var(--od-surface-2); color: var(--od-muted); flex-shrink: 0; }
.od-rail button.on .od-badge { background: rgba(255,255,255,.22); color: #fff; }
.od-rail .od-badge.bad { background: var(--od-bad-bg); color: var(--od-bad); }

/* ── Top toolbar ── */
.od-top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid rgba(226,232,240,.5); }
.od-kbar { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 12px; border-radius: 12px; border: 1px solid var(--od-line); background: var(--od-surface); color: var(--od-muted); font-weight: 600; font-size: 13px; min-width: 0; flex: 1; max-width: 320px; transition: border-color .15s, box-shadow .15s; }
.od-kbar:hover { border-color: var(--od-brand); box-shadow: 0 0 0 4px var(--od-brand-tint); }
.od-kbar svg { width: 16px; height: 16px; flex-shrink: 0; }
.od-kbar .od-lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-kbd { margin-left: auto; font-family: inherit; font-size: 10px; font-weight: 700; line-height: 1; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--od-line-2); background: var(--od-surface-2); color: var(--od-muted); white-space: nowrap; }

/* ── Cards ── */
.od-card { position: relative; background: var(--od-surface); border: 1px solid var(--od-line); border-radius: var(--od-r-card); box-shadow: var(--od-shadow); padding: 18px; min-width: 0; transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s; }
.od-card.od-lift:hover { transform: translateY(-2px); box-shadow: var(--od-shadow), 0 18px 40px -24px var(--od-brand-glow); }
.od-ch { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.od-tile { width: 36px; height: 36px; border-radius: 12px; background: var(--od-brand-tint); color: var(--od-brand); display: grid; place-items: center; flex-shrink: 0; transition: transform .3s; }
.od-tile svg { width: 16px; height: 16px; }
.od-card:hover .od-tile { transform: rotate(-6deg) scale(1.05); }
.od-ch h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--od-ink); }
.od-ch p { margin: 1px 0 0; font-size: 12px; color: var(--od-muted); }
.od-ch .od-r { margin-left: auto; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.od-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--od-muted); }
.od-mut { color: var(--od-muted); } .od-small { font-size: 12px; }
.od-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; background: var(--od-surface-2); color: var(--od-muted); }
.od-chip svg { width: 12px; height: 12px; }
.od-chip.brand { background: var(--od-brand-tint); color: var(--od-brand); }
.od-chip.good { background: var(--od-good-bg); color: var(--od-good); }
.od-chip.warn { background: var(--od-warn-bg); color: var(--od-warn); }
.od-chip.bad { background: var(--od-bad-bg); color: var(--od-bad); }
.od-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.od-dot.good { background: var(--od-good-dot); } .od-dot.warn { background: var(--od-warn-dot); }
.od-dot.bad { background: var(--od-bad-dot); animation: od-ping 1.8s infinite; }
@keyframes od-ping { 0% { box-shadow: 0 0 0 0 rgba(244,63,94,.5); } 80%, 100% { box-shadow: 0 0 0 7px rgba(244,63,94,0); } }
.od-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: var(--od-r-ctl); border: 1px solid var(--od-line-2); background: var(--od-surface); color: var(--od-ink-2); font-weight: 700; font-size: 12px; white-space: nowrap; text-decoration: none; transition: background .15s, transform .12s, box-shadow .15s; }
.od-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
.od-btn:hover { background: var(--od-surface-2); }
.od-btn:active { transform: scale(.96); }
.od-btn:disabled { opacity: .5; cursor: default; }
.od-btn.pri { background: var(--od-brand); border-color: var(--od-brand); color: #fff; box-shadow: 0 8px 20px -10px var(--od-brand-glow); }
.od-btn.pri:hover { background: var(--od-brand-hover); }
.od-btn.ghost { border-color: transparent; background: transparent; }
.od-btn.ghost:hover { background: var(--od-brand-tint); }
.od-btn.sm { height: 28px; padding: 0 9px; font-size: 11px; border-radius: 10px; }
.od-btn.sm svg { width: 14px; height: 14px; }
.od-link { border: 0; background: none; padding: 0; color: var(--od-brand); font-weight: 700; font-size: 12px; text-decoration: none; }
.od-link:hover { text-decoration: underline; }
.od-field { width: 100%; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--od-line-2); background: var(--od-surface); font-size: 13px; color: var(--od-ink); }
.od-field:focus { outline: none; border-color: var(--od-brand); box-shadow: 0 0 0 3px var(--od-brand-tint); }
.od-filters { display: flex; gap: 6px; flex-wrap: wrap; }
.od-filters button { border: 1px solid var(--od-line); background: var(--od-surface); color: var(--od-muted); font-weight: 700; font-size: 11px; padding: 5px 10px; border-radius: 99px; white-space: nowrap; }
.od-filters button[aria-pressed="true"] { background: var(--od-brand); color: #fff; border-color: transparent; box-shadow: 0 6px 16px -8px var(--od-brand-glow); }
.od-seg { display: inline-flex; padding: 3px; border-radius: 12px; background: var(--od-surface-2); border: 1px solid var(--od-line); }
.od-seg button { border: 0; background: transparent; padding: 6px 10px; border-radius: 9px; font-weight: 700; font-size: 12px; color: var(--od-muted); white-space: nowrap; }
.od-seg button[aria-pressed="true"] { background: var(--od-surface); color: var(--od-ink); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.od-ib { width: 34px; height: 34px; border-radius: 11px; border: 1px solid var(--od-lb-line); background: var(--od-lb-fill); color: var(--od-ink-2); display: grid; place-items: center; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.od-ib:hover { background: var(--od-lb-fill-2); }
.od-ib svg { width: 16px; height: 16px; }
.od-mask { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 8px; background: var(--od-surface-2); border: 1px dashed var(--od-line-2); color: var(--od-faint); font-size: 11px; font-weight: 700; white-space: nowrap; }
.od-mask svg { width: 12px; height: 12px; }
.od-lockbox { border: 2px dashed var(--od-line-2); border-radius: 18px; padding: 26px; text-align: center; color: var(--od-muted); display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; }
.od-lockbox b { color: var(--od-ink); font-size: 15px; }
.od-lockbox svg { width: 20px; height: 20px; }
.od-empty2 { font-size: 12px; color: var(--od-faint); text-align: center; padding: 18px 12px; border: 1px dashed var(--od-line-2); border-radius: 14px; }
.od-seeas { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px; background: var(--od-surface-2); border: 1px solid var(--od-line); font-size: 12px; color: var(--od-ink-2); }
.od-seeas.lead { background: var(--od-brand-tint); border-color: transparent; }
.od-seeas svg { width: 16px; height: 16px; flex-shrink: 0; color: var(--od-brand); }
.od-seeas b { color: var(--od-ink); }
.od-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 14px; }
.od-toolbar.end { align-items: flex-end; }
.od-toolbar .od-small { margin-left: auto; }
.od-psel { display: flex; flex-direction: column; gap: 4px; min-width: 220px; }
.od-psel select { font-weight: 700; }
.od-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
@media (min-width: 1180px) { .od-two { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); } }
.od-stack-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.od-txt { font-size: 13px; color: var(--od-ink-2); margin: 0; white-space: pre-line; }
.od-acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.od-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.od-tbl th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--od-muted); padding: 8px 10px; border-bottom: 1px solid var(--od-line); }
.od-tbl td { padding: 10px; border-bottom: 1px solid var(--od-line); vertical-align: middle; }
.od-tbl tr:last-child td { border-bottom: 0; }
.od-tbl .r { text-align: right; }
.od-scroll-x { overflow-x: auto; }

/* ── Bands: a light card with a brand glow, for each screen's head ── */
.od-band { position: relative; border-radius: 24px; overflow: hidden; color: var(--od-ink); border: 1px solid var(--od-line); box-shadow: var(--od-shadow);
  background: radial-gradient(700px 280px at 6% 0%, var(--od-lb-b), transparent 70%), radial-gradient(640px 320px at 100% 100%, var(--od-lb-a), transparent 70%), linear-gradient(180deg, var(--od-surface), var(--od-surface-2)); }
.od-band-h { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 18px 20px 16px; position: relative; z-index: 2; }
.od-band-h h2 { margin: 2px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -.02em; text-wrap: balance; }
.od-band-h p { margin: 2px 0 0; font-size: 12px; color: var(--od-muted); max-width: 72ch; }
.od-band-h .od-r { margin-left: auto; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.od-band .od-filters button { background: var(--od-lb-fill); border-color: var(--od-lb-line); color: var(--od-ink-2); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.od-band .od-filters button[aria-pressed="true"] { background: var(--od-brand); color: #fff; border-color: transparent; }
.od-band .od-psel select { background: var(--od-lb-fill-2); border-color: var(--od-lb-line); }
.od-glass { background: var(--od-lb-fill); border: 1px solid var(--od-lb-line); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3);
  box-shadow: inset 0 1px 0 var(--od-glass-edge), 0 10px 26px -20px var(--od-brand-glow); }
.od-lstats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0 20px 18px; position: relative; z-index: 2; }
@media (min-width: 1180px) { .od-lstats { grid-template-columns: repeat(4, minmax(0, 1fr)); } .od-lstats.three { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.od-ls1 { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; min-width: 0; }
.od-ls1 > span:not(.od-ring2) { display: flex; flex-direction: column; min-width: 0; }
.od-ls1 > span:not(.od-ring2) b { font-size: 13px; }
.od-ls1 > span:not(.od-ring2) small { font-size: 11px; color: var(--od-muted); }
.od-big { font-size: 30px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
.od-big small { font-size: 13px; color: var(--od-muted); margin-left: 2px; }
.od-ls1.alarm { border-color: rgba(251,113,133,.6); animation: od-alarm 2s infinite; }
@keyframes od-alarm { 0% { box-shadow: 0 0 0 0 rgba(244,63,94,.45); } 80%, 100% { box-shadow: 0 0 0 10px rgba(244,63,94,0); } }

/* Rings */
.od-ring2 { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; }
.od-ring2 svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.od-ring2 .od-arc { transition: stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1); }
.od-ring2 .od-rl { position: relative; display: flex; flex-direction: column; align-items: center; line-height: 1; }
.od-ring2 .od-rl b { font-size: 15px; font-weight: 800; }
.od-ring2 .od-rl small { font-size: 9px; font-weight: 700; color: var(--od-muted); text-transform: uppercase; letter-spacing: .06em; margin-top: 2px; }

/* Rise-in */
@media (prefers-reduced-motion: no-preference) {
  .od-rise { animation: od-rise .6s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d, 0) * 70ms); }
  .od-in { animation: od-rise .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * 50ms); }
}
@keyframes od-rise { from { opacity: .001; transform: translateY(14px); } }
@keyframes od-pop { from { opacity: 0; transform: translateY(12px) scale(.97); } }
@keyframes od-fade { from { opacity: 0; } }
@keyframes od-grow { from { transform: scaleX(0); } }
@keyframes od-growup { from { transform: scaleY(0); } }

/* Tilt */
.od-tilt { transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s; }
.od-tilt:hover { box-shadow: var(--od-shadow), 0 22px 44px -26px var(--od-brand-glow); }

/* ── My day: the hero ── */
.od-hero { overflow: hidden; padding: 22px; background: radial-gradient(600px 220px at 100% 0%, var(--od-brand-tint-2), transparent 70%), radial-gradient(400px 200px at 0% 100%, var(--od-brand-tint), transparent 70%), var(--od-surface); }
.od-hero-g { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; align-items: center; }
@media (min-width: 760px) { .od-hero-g { grid-template-columns: auto minmax(0, 1fr) auto; } }
.od-dayring { position: relative; width: 104px; height: 104px; display: none; }
@media (min-width: 760px) { .od-dayring { display: block; } }
.od-dayring svg { width: 104px; height: 104px; transform: rotate(-90deg); }
.od-dayring circle { fill: none; stroke-width: 10; }
.od-dayring .bgc { stroke: var(--od-brand-tint); }
.od-dayring .fg { stroke: var(--od-brand); stroke-linecap: round; transition: stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1); }
.od-dayring .lbl { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
.od-dayring .lbl b { font-size: 26px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
.od-dayring .lbl > div > span { font-size: 10px; font-weight: 700; color: var(--od-muted); letter-spacing: .06em; text-transform: uppercase; }
.od-hello h1 { margin: 2px 0 4px; font-size: 26px; line-height: 1.15; font-weight: 800; letter-spacing: -.02em; text-wrap: balance; color: var(--od-ink); }
.od-hello h1 em { font-style: normal; background: linear-gradient(90deg, var(--od-brand), #7C8FE0); -webkit-background-clip: text; background-clip: text; color: transparent; }
.od-hello p { margin: 0; color: var(--od-muted); font-size: 13px; max-width: 62ch; }
.od-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.od-stat { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 12px; border: 1px solid var(--od-line); background: var(--od-surface); font-size: 12px; font-weight: 600; color: var(--od-ink-2); }
.od-stat:hover { border-color: var(--od-brand); }
.od-stat b { font-weight: 800; }
.od-stat svg { width: 14px; height: 14px; }
.od-streak { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
@media (min-width: 760px) { .od-streak { align-items: flex-end; } }
.od-flame { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 13px; color: var(--od-warn); }
.od-flame svg { width: 16px; height: 16px; }
.od-week { display: flex; gap: 5px; }
.od-week span { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-size: 10px; font-weight: 700; background: var(--od-surface-2); color: var(--od-faint); border: 1px solid var(--od-line); }
.od-week span.d { background: var(--od-brand); color: #fff; border-color: transparent; }
.od-week span.t { border: 2px dashed var(--od-brand); color: var(--od-brand); background: transparent; }
.od-week span.t.d { border-style: solid; background: var(--od-brand); color: #fff; }
.od-qa { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--od-line); }

/* ── The client wall ── */
.od-wall { position: relative; height: 380px; cursor: grab; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.od-wall.tall { height: 430px; }
.od-wall.drag { cursor: grabbing; }
.od-wall::before { content: ""; position: absolute; inset: 6% 10%; z-index: 0; pointer-events: none;
  background: radial-gradient(closest-side at 24% 55%, rgba(61,82,160,.34), transparent), radial-gradient(closest-side at 72% 40%, rgba(124,143,224,.40), transparent), radial-gradient(closest-side at 50% 85%, rgba(16,185,129,.20), transparent);
  filter: blur(22px); }
.od-wall canvas { position: relative; z-index: 1; display: block; width: 100%; height: 100%; }
@media (max-width: 760px) { .od-wall, .od-wall.tall { height: 330px; } }
.od-wall-foot { display: flex; align-items: center; gap: 10px; padding: 0 20px 16px; font-size: 12px; color: var(--od-muted); position: relative; z-index: 2; flex-wrap: wrap; }
.od-wall-foot b { color: var(--od-ink); }
.od-wall-foot .od-bar { flex: 1; min-width: 80px; height: 3px; border-radius: 3px; background: var(--od-lb-line); overflow: hidden; }
.od-wall-foot .od-bar i { display: block; height: 100%; width: 12%; border-radius: 3px; background: var(--od-brand); transition: transform .3s, width .3s; }
.od-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* ── My day: the bento ── */
.od-bento { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 20px; }
.od-bento > * { grid-column: span 12; }
@media (min-width: 760px) { .od-c-half { grid-column: span 6; } }
@media (min-width: 1180px) {
  .od-c-focus { grid-column: span 7; grid-row: span 2; }
  .od-c-5 { grid-column: span 5; } .od-c-6 { grid-column: span 6; } .od-c-7 { grid-column: span 7; }
}
/* Up next, as a stack */
.od-stackbox { position: relative; height: 300px; margin: 4px 0 14px; perspective: 1200px; }
@media (max-width: 760px) { .od-stackbox { height: 360px; } }
.od-fcard { position: absolute; inset: 0; border-radius: 18px; border: 1px solid var(--od-line); background: var(--od-surface); box-shadow: var(--od-shadow); padding: 18px; display: flex; flex-direction: column; gap: 10px; transform-origin: 50% 100%; transition: transform .45s cubic-bezier(.2,.8,.2,1), opacity .45s, filter .45s; }
.od-fcard.top { background: linear-gradient(var(--od-surface), var(--od-surface)) padding-box, linear-gradient(135deg, var(--od-brand), var(--od-line), var(--od-brand)) border-box; border: 1.5px solid transparent; }
.od-fcard .od-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.od-fcard h4 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -.015em; line-height: 1.25; text-wrap: balance; }
.od-fcard .od-why { margin: 0; font-size: 13px; color: var(--od-muted); }
.od-script { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--od-surface-2); border: 1px solid var(--od-line); font-size: 13px; color: var(--od-ink-2); white-space: pre-line; }
.od-fcard .od-script { flex: 1; overflow: auto; min-height: 0; }
.od-script .od-eyebrow { display: block; margin-bottom: 4px; }
.od-fcard.out-done { transform: translateX(120%) rotate(14deg) !important; opacity: 0; }
.od-fcard.out-snooze { transform: translateY(-40%) rotateX(40deg) scale(.8) !important; opacity: 0; }
.od-stack-empty { position: absolute; inset: 0; border-radius: 18px; border: 2px dashed var(--od-line-2); display: grid; place-items: center; text-align: center; color: var(--od-muted); padding: 20px; font-size: 13px; }
.od-stack-empty b { display: block; color: var(--od-ink); font-size: 17px; margin: 6px 0 2px; }
.od-qlist { display: flex; flex-direction: column; border-top: 1px solid var(--od-line); }
.od-qlist button { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border: 0; border-bottom: 1px solid var(--od-line); background: none; text-align: left; font-size: 13px; color: var(--od-ink-2); font-weight: 600; min-width: 0; }
.od-qlist button > span.od-q { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-qlist button:hover { background: var(--od-surface-2); }
.od-qlist button.done { color: var(--od-faint); text-decoration: line-through; cursor: default; }
.od-qlist button svg { width: 14px; height: 14px; flex-shrink: 0; }
.od-qlist .od-t { margin-left: auto; font-size: 11px; color: var(--od-faint); font-weight: 600; white-space: nowrap; }
.od-keys { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--od-muted); margin-top: 10px; }
.od-keys span { display: inline-flex; gap: 4px; align-items: center; }
.od-keys .od-kbd { margin: 0; }
/* Today's timeline */
.od-tl { position: relative; padding-left: 52px; }
.od-tl::before { content: ""; position: absolute; left: 44px; top: 4px; bottom: 4px; width: 2px; background: var(--od-line); border-radius: 2px; }
.od-ev { position: relative; padding: 8px 10px; margin-bottom: 8px; border-radius: 12px; border: 1px solid var(--od-line); background: var(--od-surface); display: flex; gap: 10px; align-items: center; transition: background .2s; }
.od-ev:hover { background: var(--od-surface-2); }
.od-ev > svg { width: 16px; height: 16px; flex-shrink: 0; color: var(--od-muted); }
.od-ev .od-tm { position: absolute; left: -52px; top: 10px; width: 38px; text-align: right; font-size: 11px; font-weight: 700; color: var(--od-muted); }
.od-ev::before { content: ""; position: absolute; left: -12px; top: 15px; width: 10px; height: 10px; border-radius: 50%; background: var(--od-surface); border: 2px solid var(--od-brand); }
.od-ev.past { opacity: .55; }
.od-ev.past::before { background: var(--od-brand); }
.od-ev b { font-size: 13px; font-weight: 700; display: block; }
.od-ev small { font-size: 11px; color: var(--od-muted); }
.od-ev .od-btn { margin-left: auto; }
.od-now { position: relative; height: 0; margin: 2px 0 10px; }
.od-now::before { content: ""; position: absolute; left: -10px; right: 0; top: 0; border-top: 2px solid var(--od-bad-dot); }
.od-now span { position: absolute; left: -52px; top: -8px; font-size: 10px; font-weight: 800; color: #fff; background: var(--od-bad-dot); padding: 2px 5px; border-radius: 6px; }
/* Pulse tiles */
.od-pulse { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@media (min-width: 760px) { .od-pulse { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.od-pt { border: 1px solid var(--od-line); border-radius: 14px; padding: 10px; background: var(--od-surface); text-align: left; display: flex; flex-direction: column; gap: 6px; transition: transform .2s, box-shadow .2s; min-width: 0; }
.od-pt:hover { transform: translateY(-2px) scale(1.02); box-shadow: var(--od-shadow); }
.od-pt.good { background: linear-gradient(180deg, var(--od-good-bg), var(--od-surface) 70%); }
.od-pt.warn { background: linear-gradient(180deg, var(--od-warn-bg), var(--od-surface) 70%); }
.od-pt.bad { background: linear-gradient(180deg, var(--od-bad-bg), var(--od-surface) 70%); }
.od-pt b { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-pt .od-sc { display: flex; align-items: baseline; gap: 4px; }
.od-pt .od-sc strong { font-size: 18px; font-weight: 800; }
.od-pt .od-sc small { font-size: 10px; color: var(--od-muted); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-scorebar { height: 4px; border-radius: 4px; background: rgba(148,163,184,.25); overflow: hidden; }
.od-scorebar i { display: block; height: 100%; border-radius: 4px; transform-origin: left; animation: od-grow 1s cubic-bezier(.2,.8,.2,1) both; }
/* Payments to chase */
.od-meter { height: 8px; border-radius: 8px; background: var(--od-surface-2); overflow: hidden; display: flex; margin: 4px 0 12px; gap: 2px; }
.od-meter i { display: block; height: 100%; }
.od-prow { display: flex; align-items: center; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--od-line); flex-wrap: wrap; }
.od-prow:last-child { border-bottom: 0; }
.od-prow .od-who { min-width: 0; flex: 1; }
.od-prow b { font-size: 13px; font-weight: 700; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-prow small { font-size: 11px; color: var(--od-muted); }
.od-amt { font-weight: 800; font-size: 14px; white-space: nowrap; }
/* Leads at a glance */
.od-funnel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
@media (min-width: 760px) { .od-funnel { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.od-fs { border-radius: 12px; padding: 8px; background: var(--od-brand-tint); text-align: center; position: relative; overflow: hidden; border: 0; }
.od-fs b { display: block; font-size: 20px; font-weight: 800; color: var(--od-brand); }
.od-fs > span { font-size: 10px; font-weight: 700; color: var(--od-muted); letter-spacing: .04em; text-transform: uppercase; }
.od-fs.won { background: var(--od-good-bg); } .od-fs.won b { color: var(--od-good); }
.od-fs::after { content: ""; position: absolute; left: 0; bottom: 0; height: 3px; background: var(--od-brand); width: var(--w, 50%); border-radius: 3px; }
.od-fs.won::after { background: var(--od-good-dot); }
.od-hot { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--od-line); margin-bottom: 8px; border-left: 4px solid var(--od-bad-dot); background: var(--od-surface); width: 100%; text-align: left; }
.od-hot.w { border-left-color: var(--od-warn-dot); }
.od-hot.c { border-left-color: var(--od-line-2); }
.od-hot > div { min-width: 0; flex: 1; }
.od-hot b { font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-hot small { font-size: 11px; color: var(--od-muted); }
.od-hot .od-r { margin-left: auto; display: flex; gap: 6px; }
/* Who's on what */
.od-mate { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--od-line); }
.od-mate:last-child { border-bottom: 0; }
.od-mate > div { min-width: 0; }
.od-av { position: relative; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 12px; flex-shrink: 0; background: var(--od-brand); }
.od-av.alt { background: linear-gradient(135deg, var(--od-navy), var(--od-brand)); }
.od-av.sm { width: 26px; height: 26px; font-size: 10px; }
.od-av.big2 { width: 48px; height: 48px; font-size: 15px; }
.od-av i { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--od-surface); background: var(--od-good-dot); }
.od-av i.busy { background: var(--od-warn-dot); }
.od-av i.off { background: var(--od-faint); }
.od-mate b { font-size: 13px; display: block; }
.od-mate small { font-size: 11px; color: var(--od-muted); }
.od-mate .od-load { margin-left: auto; text-align: right; font-size: 11px; color: var(--od-muted); flex-shrink: 0; }
.od-mini { width: 70px; height: 5px; border-radius: 5px; background: var(--od-surface-2); overflow: hidden; margin-top: 4px; margin-left: auto; }
.od-mini i { display: block; height: 100%; background: var(--od-brand); border-radius: 5px; }
/* This week */
.od-days6 { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.od-days6 > div { border-radius: 12px; border: 1px solid var(--od-line); padding: 8px 4px; text-align: center; }
.od-days6 > div.t { border-color: var(--od-brand); background: var(--od-brand-tint); }
.od-days6 small { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--od-muted); }
.od-days6 b { display: block; font-size: 15px; font-weight: 800; }
.od-days6 i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--od-brand); margin: 3px 1px 0; }

/* ── Overlays: palette, focus mode, drawers ── */
.od-scrim { position: fixed; inset: 0; z-index: 300; background: rgba(18,24,47,.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: od-fade .2s both; }
.od-pal { position: fixed; z-index: 310; top: 12vh; left: 50%; transform: translateX(-50%); width: min(640px, calc(100% - 32px)); border-radius: 22px; background: var(--od-surface); border: 1px solid var(--od-line); box-shadow: var(--od-shadow-lg); overflow: hidden; animation: od-pop .22s cubic-bezier(.2,.8,.2,1) both; }
.od-pal-in { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--od-line); }
.od-pal-in svg { width: 18px; height: 18px; color: var(--od-muted); flex-shrink: 0; }
.od-pal-in input:focus-visible { outline: none; }
.od-pal-in input { flex: 1; border: 0; outline: none; background: transparent; font-size: 16px; font-weight: 600; min-width: 0; color: var(--od-ink); }
.od-pal-list { max-height: 50vh; overflow: auto; padding: 8px; }
.od-pal-list h6 { margin: 8px 8px 4px; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--od-faint); }
.od-pal-list button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px; border: 0; background: none; text-align: left; font-weight: 600; font-size: 13px; color: var(--od-ink-2); }
.od-pal-list button > span.od-pl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-pal-list button small { margin-left: auto; color: var(--od-faint); font-size: 11px; white-space: nowrap; }
.od-pal-list button.sel { background: var(--od-brand-tint); color: var(--od-ink); }
.od-pal-list .od-tile { width: 28px; height: 28px; border-radius: 9px; }
.od-pal-list .od-tile svg { width: 14px; height: 14px; }
.od-pal-foot { display: flex; gap: 14px; padding: 10px 16px; border-top: 1px solid var(--od-line); font-size: 11px; color: var(--od-muted); flex-wrap: wrap; }
.od-pal-empty { padding: 18px; text-align: center; font-size: 13px; color: var(--od-muted); }
.od-fm { position: fixed; inset: 0; z-index: 320; background: radial-gradient(900px 500px at 50% 0%, #1B2347, #12182F); color: #E8ECF8; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; animation: od-fade .25s both; overflow: auto; }
.od-fm-top { position: absolute; top: 16px; left: 16px; right: 16px; display: flex; align-items: center; gap: 12px; }
.od-fm-dots { display: flex; gap: 6px; flex-wrap: wrap; }
.od-fm-dots i { width: 28px; height: 4px; border-radius: 4px; background: rgba(255,255,255,.16); }
.od-fm-dots i.d { background: #10B981; } .od-fm-dots i.c { background: #fff; }
.od-fm-timer { font-variant-numeric: tabular-nums; font-weight: 800; font-size: 13px; color: #9AA6CC; }
.od-fm-top .od-btn { margin-left: auto; background: rgba(255,255,255,.08); color: #fff; border-color: rgba(255,255,255,.16); }
.od-fm-card { width: min(680px, 100%); text-align: center; animation: od-pop .35s cubic-bezier(.2,.8,.2,1) both; }
.od-fm-card .od-eyebrow { color: #9AA6CC; }
.od-fm-card h2 { font-size: clamp(26px, 4.5vw, 40px); line-height: 1.12; letter-spacing: -.025em; font-weight: 800; margin: 10px 0; text-wrap: balance; color: #fff; }
.od-fm-card p { color: #9AA6CC; font-size: 15px; margin: 0 auto 18px; max-width: 54ch; }
.od-fm-script { text-align: left; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10); border-radius: 18px; padding: 16px; font-size: 15px; line-height: 1.55; white-space: pre-line; }
.od-fm-acts { display: flex; gap: 10px; justify-content: center; margin-top: 22px; flex-wrap: wrap; }
.od-fm-acts .od-btn { height: 44px; padding: 0 18px; font-size: 14px; border-radius: 14px; background: rgba(255,255,255,.08); color: #fff; border-color: rgba(255,255,255,.10); }
.od-fm-acts .od-btn.pri { background: #fff; color: #12182F; border-color: #fff; }

/* ── Clients ── */
.od-cgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; padding: 0 20px 20px; position: relative; z-index: 2; }
.od-gcard { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; align-items: center; padding: 14px; border-radius: 18px; color: var(--od-ink); text-align: left; }
.od-gcard .od-gc-b { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.od-gcard .od-gc-b b { font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-gcard .od-gc-b small { font-size: 12px; color: var(--od-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-gcard .od-chip { align-self: flex-start; margin-top: 4px; }
.od-gcard .od-scorebar { grid-column: 1 / -1; }
.od-thirds { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
@media (min-width: 1180px) { .od-thirds { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.od-hbar { display: flex; height: 12px; border-radius: 12px; overflow: hidden; gap: 3px; margin: 6px 0 10px; background: var(--od-surface-2); }
.od-hbar i { display: block; border-radius: 12px; animation: od-grow 1s cubic-bezier(.2,.8,.2,1) both; transform-origin: left; }
.od-hleg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--od-muted); }
.od-hleg b { color: var(--od-ink); font-size: 16px; font-weight: 800; margin-right: 3px; }
.od-mini-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border: 0; border-bottom: 1px solid var(--od-line); background: none; width: 100%; text-align: left; color: inherit; }
.od-mini-row:last-child { border-bottom: 0; }
.od-mini-row > span:last-child { min-width: 0; flex: 1; }
.od-mini-row b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .od-mini-row small { font-size: 11px; color: var(--od-muted); }
.od-cd { width: 44px; height: 44px; border-radius: 14px; background: var(--od-brand-tint); color: var(--od-brand); display: grid; place-items: center; font-weight: 800; font-size: 16px; line-height: 1; flex-shrink: 0; text-align: center; }
.od-cd small { font-size: 9px; display: block; }
.od-bign { font-size: 44px; font-weight: 800; letter-spacing: -.03em; color: var(--od-ink); line-height: 1; margin: 6px 0 8px; }

/* The client page */
.od-c3 { padding: 18px 22px; }
.od-c3-top { display: flex; align-items: center; gap: 10px; position: relative; z-index: 2; }
.od-back { color: var(--od-muted); font-size: 12px; font-weight: 700; display: inline-flex; gap: 4px; align-items: center; border: 0; background: none; padding: 0; }
.od-back:hover { color: var(--od-brand); }
.od-back svg { width: 14px; height: 14px; }
.od-c3-top .od-chip { margin-left: auto; }
.od-c3-g { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: center; margin-top: 10px; position: relative; z-index: 2; }
@media (min-width: 1180px) { .od-c3-g { grid-template-columns: minmax(0, 1fr) auto; } }
.od-c3-l h2 { font-size: 30px; margin: 4px 0; font-weight: 800; letter-spacing: -.02em; }
.od-c3-l p { margin: 0; color: var(--od-muted); font-size: 13px; }
.od-c3-l .od-acts { margin-top: 14px; }
.od-bandbtn { background: var(--od-lb-fill-2); color: var(--od-ink-2); border-color: var(--od-lb-line); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.od-c3-r { display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap; }
.od-c3-stat { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px 16px; border-radius: 18px; min-width: 110px; }
.od-c3-stat .od-eyebrow { font-size: 10px; }
.od-journey { display: flex; align-items: center; margin: 18px 0 4px; position: relative; z-index: 2; gap: 6px; }
.od-jn { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; font-size: 11px; font-weight: 700; color: var(--od-muted); position: relative; min-width: 0; }
.od-jn i { width: 100%; height: 4px; border-radius: 4px; background: var(--od-line); position: relative; }
.od-jn.d i { background: var(--od-good-dot); }
.od-jn.c i { background: linear-gradient(90deg, var(--od-good-dot), var(--od-line)); }
.od-jn.c i::after { content: ""; position: absolute; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px; border-radius: 50%; background: var(--od-brand); animation: od-jpulse 1.8s infinite; }
@keyframes od-jpulse { 0% { box-shadow: 0 0 0 0 var(--od-brand-glow); } 80%, 100% { box-shadow: 0 0 0 10px transparent; } }
.od-jn.c { color: var(--od-ink); } .od-jn.d { color: var(--od-good); }
@media (max-width: 760px) { .od-jn { font-size: 9px; } }
.od-c3-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; position: relative; z-index: 2; }
.od-gchip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; color: var(--od-ink); }
.od-gchip svg { width: 14px; height: 14px; }
.od-ptabs { position: relative; display: flex; gap: 2px; padding: 4px; border-radius: 16px; background: var(--od-surface); border: 1px solid var(--od-line); box-shadow: var(--od-shadow); overflow-x: auto; scrollbar-width: none; }
.od-ptabs::-webkit-scrollbar { display: none; }
.od-ptabs button { position: relative; border: 0; background: transparent; padding: 9px 14px; border-radius: 12px; font-weight: 700; font-size: 13px; color: var(--od-muted); white-space: nowrap; display: inline-flex; gap: 6px; align-items: center; transition: color .2s; }
.od-ptabs button span { position: relative; }
.od-ptabs button[aria-pressed="true"] { color: #fff; }
.od-ptabs .od-ind { position: absolute; inset: 0; border-radius: 12px; background: var(--od-brand); box-shadow: 0 8px 18px -10px var(--od-brand-glow); }
.od-focus-card { border: 1.5px solid transparent; background: linear-gradient(var(--od-surface), var(--od-surface)) padding-box, linear-gradient(135deg, var(--od-brand), var(--od-line), var(--od-brand)) border-box; }
.od-focus-card h4 { margin: 4px 0; font-size: 18px; font-weight: 800; letter-spacing: -.01em; }
.od-river { position: relative; display: flex; flex-direction: column; gap: 10px; padding-left: 22px; }
.od-river::before { content: ""; position: absolute; left: 13px; top: 6px; bottom: 6px; width: 2px; background: linear-gradient(var(--od-brand-tint-2), var(--od-line)); }
.od-rv { position: relative; display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--od-line); background: var(--od-surface); }
.od-rv-ic { position: absolute; left: -22px; top: 10px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--od-brand-tint); color: var(--od-brand); border: 2px solid var(--od-surface); }
.od-rv-ic svg { width: 12px; height: 12px; }
.od-rv.good .od-rv-ic { background: var(--od-good-bg); color: var(--od-good); } .od-rv.warn .od-rv-ic { background: var(--od-warn-bg); color: var(--od-warn); } .od-rv.bad .od-rv-ic { background: var(--od-bad-bg); color: var(--od-bad); }
.od-rv-b { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.od-rv-b b { font-size: 13px; } .od-rv-b small { font-size: 11px; color: var(--od-muted); }
.od-rv-b .od-chip { align-self: flex-start; }
.od-next { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 8px; background: var(--od-brand-tint); color: var(--od-brand); }
.od-next.done { background: var(--od-good-bg); color: var(--od-good); text-decoration: line-through; }
.od-next svg { width: 12px; height: 12px; }
.od-dec { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; border: 1px solid var(--od-line); margin-bottom: 8px; }
.od-dec.open { border-left: 4px solid var(--od-warn-dot); }
.od-dec .od-who { flex: 1; min-width: 0; } .od-dec b { font-size: 13px; display: block; } .od-dec small { font-size: 11px; color: var(--od-muted); }
.od-pj { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(170px, 1fr); gap: 12px; overflow-x: auto; padding: 8px 2px 4px; }
.od-pjn { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 30px 12px 12px; border-radius: 16px; border: 1px solid var(--od-line); background: var(--od-surface); }
.od-pjn::before { content: ""; position: absolute; left: -12px; right: 50%; top: 18px; height: 3px; background: var(--od-line); }
.od-pjn:first-child::before { display: none; }
.od-pjn.paid::before { background: var(--od-good-dot); }
.od-pjd { position: absolute; top: 8px; left: 12px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 12px; background: var(--od-surface-2); color: var(--od-faint); border: 2px solid var(--od-line); }
.od-pjd svg { width: 12px; height: 12px; }
.od-pjn.paid .od-pjd { background: var(--od-good-dot); color: #fff; border-color: transparent; }
.od-pjn.due .od-pjd { background: var(--od-warn-dot); color: #fff; border-color: transparent; }
.od-pjn.late .od-pjd { background: var(--od-bad-dot); color: #fff; border-color: transparent; animation: od-ping 1.8s infinite; }
.od-pjn b { font-size: 13px; } .od-pjn small { font-size: 11px; color: var(--od-muted); }
.od-pjn .od-amt, .od-pjn .od-mask, .od-pjn .od-btn { align-self: flex-start; margin-top: 4px; }
.od-bigamt { font-size: 22px; font-weight: 800; letter-spacing: -.02em; display: block; }

/* Fanned sheets and the approval countdown */
.od-fan { position: relative; display: inline-block; width: 74px; height: 52px; flex-shrink: 0; }
.od-fan i { position: absolute; left: 6px; top: 4px; width: 60px; height: 42px; border-radius: 6px; border: 1px solid var(--od-line-2); background: repeating-linear-gradient(90deg, transparent 0 7px, var(--od-brand-tint) 7px 8px), repeating-linear-gradient(0deg, transparent 0 7px, var(--od-brand-tint) 7px 8px), var(--od-surface); box-shadow: 0 4px 10px -4px rgba(18,24,47,.3); transform: rotate(calc((var(--k) - 1) * 5deg)) translateX(calc(var(--k) * 2px)); transition: transform .35s cubic-bezier(.2,.8,.2,1.3); }
.od-apcard:hover .od-fan i, .od-fan:hover i { transform: rotate(calc((var(--k) - 1.5) * 12deg)) translateX(calc((var(--k) - 1.5) * 10px)) translateY(-3px); }
.od-cdown { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
.od-pips { display: flex; gap: 4px; } .od-pips i { width: 14px; height: 4px; border-radius: 4px; background: var(--od-line); } .od-pips i.on { background: var(--od-warn-dot); }
.od-aplist { display: flex; flex-direction: column; gap: 14px; }
.od-apcard { position: relative; border: 1px solid var(--od-line); border-radius: var(--od-r-card); background: var(--od-surface); box-shadow: var(--od-shadow); padding: 16px 18px; overflow: hidden; }
.od-apcard::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--od-brand); }
.od-apcard.overdue::before, .od-apcard.changes::before { background: var(--od-bad-dot); }
.od-apcard.sent::before, .od-apcard.presented::before { background: var(--od-warn-dot); }
.od-apcard.approved::before { background: var(--od-good-dot); }
.od-ap-h { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
.od-ap-h .od-who { flex: 1; min-width: 200px; }
.od-ap-h .od-who b { font-size: 14px; display: block; } .od-ap-h .od-who small { font-size: 12px; color: var(--od-muted); }
.od-rooms { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.od-room { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 12px; background: var(--od-surface-2); border: 1px solid var(--od-line); font-size: 12px; color: var(--od-ink-2); }
.od-room b { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--od-muted); margin-right: 2px; }
.od-room span + span::before { content: "·"; margin-right: 6px; color: var(--od-faint); }
.od-room em { font-style: normal; color: var(--od-faint); font-size: 11px; }
.od-stamp { position: absolute; top: 18px; right: 22px; transform: rotate(-8deg); padding: 2px 8px; border: 2px solid var(--od-good-dot); border-radius: 10px; color: var(--od-good-dot); font-weight: 800; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; background: var(--od-surface); opacity: .9; pointer-events: none; z-index: 3; }
.od-outside-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 14px; border: 1px dashed var(--od-line-2); border-radius: 16px; background: var(--od-surface); }
.od-outside-row p { margin: 0; flex: 1; min-width: 200px; font-size: 13px; color: var(--od-muted); }
.od-outside-row p b { color: var(--od-ink); }
.od-outside-row > svg { width: 16px; height: 16px; color: var(--od-brand); }

/* Client pulse */
.od-pgrid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.od-pcard { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--od-r-card); border: 1px solid var(--od-line); background: var(--od-surface); box-shadow: var(--od-shadow); }
.od-pcard.bad { border-color: var(--od-bad-dot); background: linear-gradient(180deg, var(--od-bad-bg), var(--od-surface) 90px); }
.od-pc-top { display: flex; align-items: center; gap: 12px; }
.od-pc-top > span:not(.od-ring2) { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.od-pc-top b { font-size: 14px; } .od-pc-top small { font-size: 11px; color: var(--od-muted); }
.od-pts { display: flex; flex-direction: column; gap: 6px; }
.od-pt2 { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--od-ink-2); }
.od-pt2 b { min-width: 34px; text-align: center; padding: 2px 6px; border-radius: 8px; font-size: 11px; flex-shrink: 0; }
.od-pt2.up b { background: var(--od-good-bg); color: var(--od-good); } .od-pt2.down b { background: var(--od-bad-bg); color: var(--od-bad); }
.od-pcard .od-acts { margin-top: auto; }

/* Waiting on client */
.od-wlist { display: flex; flex-direction: column; gap: 10px; }
.od-wcard { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 18px; border: 1px solid var(--od-line); background: var(--od-surface); box-shadow: var(--od-shadow); }
.od-wcard.bad { border-left: 4px solid var(--od-bad-dot); } .od-wcard.warn { border-left: 4px solid var(--od-warn-dot); } .od-wcard.good { border-left: 4px solid var(--od-good-dot); }
.od-wic { width: 40px; height: 40px; border-radius: 14px; display: grid; place-items: center; background: var(--od-brand-tint); color: var(--od-brand); flex-shrink: 0; }
.od-wic svg { width: 16px; height: 16px; }
.od-wcard.bad .od-wic { background: var(--od-bad-bg); color: var(--od-bad); } .od-wcard.warn .od-wic { background: var(--od-warn-bg); color: var(--od-warn); }
.od-wcard .od-who { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 3px; }
.od-wcard .od-who b { font-size: 13px; } .od-wcard .od-who small { font-size: 11px; color: var(--od-muted); }
.od-wbar { display: flex; align-items: center; gap: 8px; margin: 4px 0 2px; }
.od-wbar i { display: block; height: 6px; border-radius: 6px; background: linear-gradient(90deg, var(--od-warn-dot), var(--od-bad-dot)); transform-origin: left; animation: od-grow .8s cubic-bezier(.2,.8,.2,1) both; max-width: 70%; min-width: 6px; }
.od-wcard.good .od-wbar i { background: var(--od-good-dot); }
.od-wbar span { font-size: 11px; font-weight: 700; color: var(--od-ink-2); }

/* Payments */
.od-age { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 0 20px 20px; position: relative; z-index: 2; }
@media (min-width: 760px) { .od-age { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.od-agecol { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto 70px; gap: 6px 10px; align-items: end; padding: 12px 14px; border-radius: 16px; }
.od-agecol .od-eyebrow { grid-column: 1 / -1; }
.od-agebar { height: 70px; display: flex; align-items: flex-end; }
.od-agebar i { display: block; width: 100%; height: var(--h); border-radius: 10px 10px 4px 4px; animation: od-growup 1s cubic-bezier(.2,.8,.2,1) both; transform-origin: bottom; min-height: 6px; }
.od-agebar i.warn { background: linear-gradient(var(--od-warn-dot), rgba(245,158,11,.4)); } .od-agebar i.bad { background: linear-gradient(var(--od-bad-dot), rgba(244,63,94,.4)); }
.od-agecol > b { font-size: 30px; font-weight: 800; }
.od-bigout { display: flex; flex-direction: column; align-items: flex-end; }
.od-bigout b { font-size: 28px; font-weight: 800; letter-spacing: -.02em; }
.od-paylist { display: flex; flex-direction: column; gap: 10px; }
.od-paycard { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: center; padding: 14px; border-radius: 18px; border: 1px solid var(--od-line); background: var(--od-surface); box-shadow: var(--od-shadow); }
@media (min-width: 760px) { .od-paycard { grid-template-columns: auto minmax(0, 1fr) auto auto; } }
.od-paycard .od-who b { font-size: 14px; display: block; } .od-paycard .od-who > small { font-size: 12px; color: var(--od-muted); display: block; }
.od-pdays { width: 70px; height: 70px; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.od-pdays b { font-size: 24px; font-weight: 800; } .od-pdays small { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-top: 3px; text-align: center; }
.od-pdays.late { background: var(--od-bad-bg); color: var(--od-bad); } .od-pdays.due { background: var(--od-warn-bg); color: var(--od-warn); }
.od-pips3 { display: inline-flex; align-items: center; gap: 4px; margin: 6px 8px 0 0; } .od-pips3 i { width: 18px; height: 5px; border-radius: 5px; background: var(--od-line); } .od-pips3 i.on { background: var(--od-brand); } .od-pips3 small { margin-left: 4px; font-size: 11px; color: var(--od-muted); }

/* Meetings and visits: the week */
.od-wk { display: grid; grid-template-columns: repeat(7, minmax(110px, 1fr)); gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.od-wkd { display: flex; flex-direction: column; gap: 6px; min-height: 120px; padding: 10px; border-radius: 16px; border: 1px solid var(--od-line); background: var(--od-surface); }
.od-wkd > b { font-size: 20px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
.od-wkd.today { border-color: var(--od-brand); box-shadow: 0 0 0 3px var(--od-brand-tint); }
.od-wkd.today > b { color: var(--od-brand); }
.od-ev2 { font-size: 11px; font-weight: 600; padding: 5px 7px; border-radius: 9px; background: var(--od-brand-tint); color: var(--od-brand); line-height: 1.3; border: 0; text-align: left; }
.od-ev2.asked { background: var(--od-warn-bg); color: var(--od-warn); }
.od-ev2.held { background: var(--od-surface-2); color: var(--od-muted); }
.od-ev2.lead { background: var(--od-surface-2); color: var(--od-ink-2); border: 1px dashed var(--od-line-2); }

/* Minutes, escalations, team, guide */
.od-list { display: flex; flex-direction: column; gap: 12px; }
.od-mhead { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.od-mhead .od-who { flex: 1; min-width: 200px; }
.od-mhead .od-who b { font-size: 14px; display: block; } .od-mhead .od-who small { font-size: 12px; color: var(--od-muted); }
.od-esc { display: flex; flex-direction: column; gap: 10px; }
.od-esc.open { border-left: 4px solid var(--od-bad-dot); } .od-esc.decided { border-left: 4px solid var(--od-good-dot); }
.od-decision { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--od-good-bg); color: var(--od-good); font-size: 13px; }
.od-teamg { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
@media (max-width: 760px) { .od-teamg { grid-template-columns: 1fr; } }
.od-tstats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
@media (min-width: 760px) { .od-tstats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.od-tstats span { display: flex; flex-direction: column; padding: 8px; border-radius: 12px; background: var(--od-surface-2); font-size: 11px; color: var(--od-muted); }
.od-tstats b { font-size: 18px; font-weight: 800; color: var(--od-ink); }
.od-dnote { padding: 10px 12px; border-radius: 14px; border: 1px solid var(--od-brand-tint-2); background: var(--od-brand-tint); display: flex; flex-direction: column; gap: 6px; }
.od-dnote.read { background: var(--od-surface-2); border-color: var(--od-line); }
.od-dnote p { margin: 0; font-size: 13px; color: var(--od-ink-2); white-space: pre-line; }
.od-dnote .od-btn { align-self: flex-start; }

/* A screen's inner card (old panels inside the new frame) */
.od-inner { padding: 20px; }

/* Reduced motion: nothing moves. */
@media (prefers-reduced-motion: reduce) {
  .od2 *, .od2 *::before, .od2 *::after, .od-ov *, .od-ov *::before, .od-ov *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;

let added = false;
export function addOd2Styles() {
  if (added || typeof document === 'undefined') return;
  added = true;
  const el = document.createElement('style');
  el.setAttribute('data-od2', '');
  el.textContent = OD2_CSS;
  document.head.appendChild(el);
}
addOd2Styles();

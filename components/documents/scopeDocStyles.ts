/**
 * Shared paper for the Detailed BOQ and the Scope Revision.
 *
 * Scoped under `.sdoc` and injected by each sheet, the way the other document
 * sheets carry their own styles, so a sheet renders identically in the studio,
 * the reading room and a printed PDF with nothing else loaded.
 */
export const SCOPE_DOC_CSS = `
.sdoc{--ink:#1d2238;--ink2:#3a4060;--mut:#6a7092;--line:#c9cee0;--line2:#eceef5;--brand:#28216f;--wash:#f6f7fb;--gold:#8a6e3a;--gold-ln:#d7c7a4;--gold-bg:#fbf7ef;--pos:#8a3b2e;--neg:#2f6b4f;
  font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:#fff;
  width:100%;max-width:820px;margin:0 auto;padding:44px 52px 40px;font-size:11px;line-height:1.5;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.sdoc *{box-sizing:border-box}
.sdoc .lh{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid var(--brand);padding-bottom:10px}
.sdoc .brand{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--brand)}
.sdoc .brand small{display:block;font-size:7.5px;letter-spacing:.14em;color:var(--mut);margin-top:3px;font-weight:700}
.sdoc .dockind{text-align:right;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
.sdoc .dockind small{display:block;font-size:8.5px;letter-spacing:.04em;text-transform:none;color:var(--mut);font-weight:600;margin-top:3px}
.sdoc h1{font:700 22px/1.2 "Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:-.01em;margin:16px 0 4px;text-wrap:balance;color:var(--ink)}
.sdoc .lede{color:var(--ink2);font-size:11px;margin:0 0 12px;max-width:62ch}
.sdoc .parties{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:6px;overflow:hidden;margin:10px 0 4px}
.sdoc .parties div{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid var(--line2);font-size:9.5px}
.sdoc .parties div:nth-child(odd){border-right:1px solid var(--line2)}
.sdoc .parties span{color:var(--mut)}
.sdoc .parties b{text-align:right;font-weight:700;overflow-wrap:anywhere}
.sdoc .dh{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--brand);margin:18px 0 6px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-bottom:1px solid var(--brand);padding-bottom:3px}
.sdoc .dh span{letter-spacing:0;text-transform:none;font-weight:700;color:var(--ink);font-size:10px}
.sdoc .rh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:10px;font-weight:800;color:var(--ink);margin:12px 0 4px;padding-bottom:3px;border-bottom:1px solid var(--line)}
.sdoc .rh em{font-style:normal;color:var(--mut);font-weight:600}
.sdoc .rh .num{font-weight:800}
.sdoc table{width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed}
.sdoc table.auto{table-layout:auto}
.sdoc th{font-size:7.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);text-align:right;padding:5px 6px;border-bottom:1px solid var(--line);background:var(--wash)}
.sdoc th.l,.sdoc td.l{text-align:left}
.sdoc td{padding:5px 6px;border-bottom:1px solid var(--line2);text-align:right;vertical-align:top;overflow-wrap:anywhere}
.sdoc td.num,.sdoc th.num,.sdoc .num{font-variant-numeric:tabular-nums}
.sdoc td .nm{font-weight:700;color:var(--ink)}
.sdoc td small{display:block;color:var(--mut);font-size:8.5px;margin-top:1px;line-height:1.35}
.sdoc .nw{white-space:nowrap}
.sdoc tfoot td{font-weight:800;border-top:1.5px solid var(--brand);border-bottom:0;background:#fafbfd}
.sdoc .tag{font-size:7px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--gold-ln);color:var(--gold);background:var(--gold-bg);border-radius:3px;padding:0 4px;margin-left:5px;white-space:nowrap;vertical-align:1px}
.sdoc .tag.rm{border-color:#e3c1bb;color:var(--pos);background:#fbf1ef}
.sdoc .tag.nw2{border-color:#c4cbe8;color:var(--brand);background:#f1f0fb}
.sdoc .pos{color:var(--pos)}.sdoc .neg{color:var(--neg)}
.sdoc .note{margin-top:10px;padding:8px 10px;border:1px solid var(--line2);background:var(--wash);border-radius:6px;font-size:9.5px;color:var(--ink2)}
.sdoc .tot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:9px 12px;background:#f1f0fb;border-left:3px solid var(--brand);font-weight:800;font-size:11px}
.sdoc .tot b{font-size:13px;color:var(--brand)}
.sdoc .signs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
.sdoc .sgn{border:1px solid var(--line);border-radius:6px;padding:10px 12px;font-size:8.5px;color:var(--mut)}
.sdoc .sgn b{display:block;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);margin-bottom:4px}
.sdoc .sgn .line{height:34px;border-bottom:1px solid var(--ink);margin:6px 0 4px;display:flex;align-items:flex-end;font:600 16px "Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--brand)}
.sdoc .sgn .line.empty{color:#b4b9cf;font:italic 500 11px "Plus Jakarta Sans",sans-serif}
.sdoc .cert{margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:8px;color:var(--mut);border-top:1px dashed var(--line);padding-top:8px}
.sdoc .cert code{font:700 8px ui-monospace,Menlo,Consolas,monospace;color:var(--ink);background:var(--wash);padding:1px 5px;border-radius:3px}
.sdoc .foot{display:flex;justify-content:space-between;gap:10px;margin-top:10px;font-size:7.5px;color:#9aa0bb}
.sdoc .bridge td{padding:6px 6px}
.sdoc .bridge .lab b{display:block;font-size:10px;color:var(--ink)}
.sdoc .bridge .lab small{color:var(--mut);font-size:8.5px}
.sdoc .avoid{break-inside:avoid;page-break-inside:avoid}
.sdoc .attach{margin-top:26px;padding-top:16px;border-top:2px dashed var(--line)}
.sdoc .attach-h{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin-bottom:6px}
.sdoc .room-note{font-size:9px;color:var(--ink2);padding:4px 6px 6px;font-style:italic}
@media print{.sdoc{padding:0 6px}.sdoc tr{break-inside:avoid}.sdoc .dh{break-after:avoid}}
@media (max-width:640px){.sdoc{padding:28px 18px}.sdoc .parties{grid-template-columns:1fr}.sdoc .parties div:nth-child(odd){border-right:0}.sdoc .signs{grid-template-columns:1fr}}
`;

export const inr2 = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const inr0 = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
/** Without the symbol, for table columns headed "(₹)". */
export const amt = (n: number, dp = 0) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const rateText = (n: number) => {
  const v = Number(n) || 0;
  return v.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
};
export const signed0 = (n: number) => {
  const r = Math.round(Number(n) || 0);
  return r === 0 ? '0' : `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('en-IN')}`;
};
export const qtyText = (n: number | undefined) =>
  n === undefined || n === null || !(n > 0) ? '—' : String(+(+n).toFixed(2));
export const longDate = (t?: number | string | null) =>
  t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

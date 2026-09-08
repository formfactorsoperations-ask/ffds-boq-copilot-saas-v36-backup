import React from 'react';
import { formatINR } from '../../lib/utils';
import { PaymentMilestone, ProjectDecisionRecord } from '../../types';
// The same resolver the studio screen uses, so a decision cannot read as a
// design decision on one side of the wall and a site decision on the other.
import { decisionNature } from '../../services/clientPortalEngine';

/** Design or site, worded and coloured exactly as the studio sees it. */
const NatureBadge: React.FC<{ nature: 'design' | 'site' }> = ({ nature }) => (
  <span
    className={`inline-flex items-center text-[10px] font-black px-1.5 py-0.5 rounded border ${
      nature === 'design'
        ? 'bg-violet-50 text-violet-700 border-violet-200'
        : 'bg-teal-50 text-teal-700 border-teal-200'
    }`}
  >
    {nature === 'design' ? 'Design' : 'Site'}
  </span>
);

/**
 * The client's record: decisions, documents and payments as tables.
 *
 * Each opens with a summary strip so the headline lands before the detail — a
 * client wants "one thing needs me, nothing overdue" before they want rows.
 * Decisions carry who signed off and when, because an approval without a
 * timestamp is not a record of anything.
 */

const Pill: React.FC<{ tone: 'wait' | 'ok' | 'soon' | 'new'; children: React.ReactNode }> = ({ tone, children }) => {
  const styles = {
    wait: 'text-amber-800 bg-amber-50 border-amber-200',
    ok:   'text-emerald-800 bg-emerald-50 border-emerald-200',
    soon: 'text-slate-500 bg-slate-50 border-slate-200',
    new:  'text-[#0055B3] bg-sky-50 border-sky-200',
  }[tone];
  return <span className={`inline-block text-[10px] font-bold rounded-md border px-2 py-0.5 whitespace-nowrap ${styles}`}>{children}</span>;
};

const Stat: React.FC<{ n: React.ReactNode; label: string; tone?: 'warn' | 'good' }> = ({ n, label, tone }) => (
  <div className="border border-slate-200 rounded-xl px-3.5 py-3 bg-white">
    <p className={`text-lg font-extrabold tabular-nums tracking-tight ${
      tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'
    }`}>{n}</p>
    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{label}</p>
  </div>
);

const Shell: React.FC<{ stats: React.ReactNode; children: React.ReactNode }> = ({ stats, children }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{stats}</div>
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <div className="overflow-x-auto">{children}</div>
    </div>
  </div>
);

const th = 'text-[10px] font-black uppercase tracking-wider text-slate-400 text-left px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 whitespace-nowrap';
const td = 'text-xs px-3.5 py-3 border-b border-slate-50 align-top text-slate-600';

const fmtDate = (v?: string) =>
  v ? new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';
const fmtStamp = (v?: string) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/* ── Decisions ─────────────────────────────────────────────────────────── */

export const DecisionsTable: React.FC<{ decisions: ProjectDecisionRecord[]; stageNumber?: number }> = ({ decisions, stageNumber = 0 }) => {
  const waiting = decisions.filter(d => d.status === 'pending' || d.status === 'proposed').length;
  const approved = decisions.filter(d => d.status === 'confirmed').length;

  if (decisions.length === 0) {
    return <p className="text-sm text-slate-500 font-medium">No decisions have been raised with you yet.</p>;
  }

  return (
    <Shell stats={<>
      <Stat n={waiting} label="Waiting on you" tone={waiting ? 'warn' : undefined} />
      <Stat n={approved} label="Approved" tone="good" />
      <Stat n={decisions.length} label="Total raised" />
      <Stat n={decisions.filter(d => d.status === 'rejected').length} label="Queried" />
    </>}>
      <table className="w-full min-w-[560px] border-collapse">
        <thead><tr>
          <th className={th}>Decision</th><th className={th}>Where</th><th className={th}>Raised</th>
          <th className={th}>Status</th><th className={th}>Signed off</th>
        </tr></thead>
        <tbody>
          {decisions.map(d => (
            <tr key={d.id} className="hover:bg-sky-50/40">
              <td className={td}>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-900">{d.title}</p>
                  <NatureBadge nature={decisionNature(d as any, stageNumber)} />
                </div>
                {d.description && <p className="text-[10px] text-slate-500 mt-0.5">{d.description}</p>}
                {d.drawingUrl && (
                  <a href={d.drawingUrl} target="_blank" rel="noopener noreferrer"
                     className="text-[10px] font-bold text-[#0066CC] hover:text-[#0055B3] underline underline-offset-2">
                    View drawing
                  </a>
                )}
              </td>
              <td className={td}>{d.roomId || '—'}</td>
              <td className={td}>{fmtDate(d.date)}</td>
              <td className={td}>
                {d.status === 'confirmed' ? <Pill tone="ok">Approved</Pill>
                  : d.status === 'rejected' ? <Pill tone="wait">Queried</Pill>
                  : <Pill tone="wait">Awaiting you</Pill>}
              </td>
              <td className={td}>
                {d.clientConfirmedAt ? (
                  <>
                    <span className="font-semibold text-slate-700">{d.confirmingParty || 'You'}</span>
                    <br /><span className="text-[10px]">{fmtStamp(d.clientConfirmedAt)}</span>
                  </>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
};

/* ── Documents ─────────────────────────────────────────────────────────── */

export interface PortalDocRow {
  id: string;
  name: string;
  detail?: string;
  type?: string;
  issued?: string;
  status: 'needs_signature' | 'issued' | 'new' | 'upcoming' | 'signed';
}

export const DocumentsTable: React.FC<{ docs: PortalDocRow[] }> = ({ docs }) => {
  const needs = docs.filter(d => d.status === 'needs_signature').length;
  const issued = docs.filter(d => d.status === 'issued' || d.status === 'signed' || d.status === 'new').length;
  const upcoming = docs.filter(d => d.status === 'upcoming').length;

  if (docs.length === 0) {
    return <p className="text-sm text-slate-500 font-medium">Nothing has been issued to you yet.</p>;
  }

  return (
    <Shell stats={<>
      <Stat n={needs} label="Needs your signature" tone={needs ? 'warn' : undefined} />
      <Stat n={issued} label="Issued to you" tone="good" />
      <Stat n={upcoming} label="Still to come" />
      <Stat n={docs.length} label="Total in your file" />
    </>}>
      <table className="w-full min-w-[520px] border-collapse">
        <thead><tr>
          <th className={th}>Document</th><th className={th}>Type</th>
          <th className={th}>Issued</th><th className={th}>Status</th>
        </tr></thead>
        <tbody>
          {docs.map(d => (
            <tr key={d.id} className="hover:bg-sky-50/40">
              <td className={td}>
                <p className="font-bold text-slate-900">{d.name}</p>
                {d.detail && <p className="text-[10px] text-slate-500 mt-0.5">{d.detail}</p>}
              </td>
              <td className={td}>{d.type || '—'}</td>
              <td className={td}>{fmtDate(d.issued)}</td>
              <td className={td}>
                {d.status === 'needs_signature' ? <Pill tone="wait">Needs signature</Pill>
                  : d.status === 'signed' ? <Pill tone="ok">Signed</Pill>
                  : d.status === 'new' ? <Pill tone="new">New</Pill>
                  : d.status === 'issued' ? <Pill tone="ok">Issued</Pill>
                  : <Pill tone="soon">Upcoming</Pill>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
};

/* ── Payments ──────────────────────────────────────────────────────────── */

export const PaymentsTable: React.FC<{
  milestones: PaymentMilestone[];
  amountOf: (m: PaymentMilestone) => number;
  projectValue: number;
  totalPaid: number;
  balanceDue: number;
  overdueCount: number;
}> = ({ milestones, amountOf, projectValue, totalPaid, balanceDue, overdueCount }) => {
  const pct = projectValue > 0 ? Math.min(100, Math.round((totalPaid / projectValue) * 100)) : 0;

  return (
    <Shell stats={<>
      <Stat n={formatINR(projectValue)} label="Project value" />
      <Stat n={formatINR(totalPaid)} label="Cleared" tone="good" />
      <Stat n={formatINR(balanceDue)} label="Remaining" />
      <Stat n={overdueCount} label="Overdue" tone={overdueCount ? 'warn' : 'good'} />
    </>}>
      <div className="px-3.5 pt-3.5">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 font-semibold mt-1.5 mb-1">
          {pct}% cleared{overdueCount === 0 ? ' · nothing overdue' : ` · ${overdueCount} overdue`}
        </p>
      </div>
      <table className="w-full min-w-[540px] border-collapse">
        <thead><tr>
          <th className={th}>Milestone</th><th className={th}>Raised when</th>
          <th className={th}>Status</th><th className={`${th} text-right`}>Amount</th>
        </tr></thead>
        <tbody>
          {milestones.map(m => (
            <tr key={m.id} className="hover:bg-sky-50/40">
              <td className={td}>
                <p className="font-bold text-slate-900">{m.name}</p>
                {m.description && <p className="text-[10px] text-slate-500 mt-0.5">{m.description}</p>}
              </td>
              <td className={td}>{m.trigger || (m.date ? fmtDate(m.date) : '—')}</td>
              <td className={td}>
                {m.status === 'paid' ? <Pill tone="ok">Paid</Pill>
                  : m.status === 'invoiced' ? <Pill tone="wait">Invoiced</Pill>
                  : <Pill tone="soon">Not yet due</Pill>}
              </td>
              <td className={`${td} text-right font-bold text-slate-900 tabular-nums whitespace-nowrap`}>
                {formatINR(amountOf(m))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
};

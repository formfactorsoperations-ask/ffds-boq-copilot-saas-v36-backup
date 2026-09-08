/**
 * SNAG LIST & DEFECT REPORT SHEET
 *
 * The document a client signs before handover.
 *
 * The snag list existed only as an internal tracker, which left the handover
 * resting on an unrecorded conversation: the studio believed every defect was
 * closed, the client believed some were outstanding, and nothing on file said
 * which. Signing this is the client agreeing the list is complete and that each
 * item was closed or knowingly accepted.
 *
 * Every figure comes from the frozen snapshot, so the paper cannot move after
 * it is sent. Anything absent is stated as absent rather than filled in.
 */

import React from 'react';

export interface SnagRow {
  roomName: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved' | 'verified';
  raisedAt?: number | null;
  resolvedAt?: number | null;
  notes?: string | null;
}

export interface SnagListSheetProps {
  studioName: string;
  clientName: string;
  projectName: string;
  location?: string;
  displayDate: string;
  snags: SnagRow[];
  totalCount: number;
  closedCount: number;
  openCount: number;
  org: { orgLogo?: string; contactEmail?: string; officeAddress?: string };
}

const d = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATUS: Record<string, { label: string; cls: string }> = {
  verified:    { label: 'Closed & verified', cls: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
  resolved:    { label: 'Closed',            cls: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
  in_progress: { label: 'In progress',       cls: 'text-amber-800 bg-amber-50 border-amber-200' },
  open:        { label: 'Open',              cls: 'text-rose-800 bg-rose-50 border-rose-200' },
};

const SEVERITY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

const SnagListSheet: React.FC<SnagListSheetProps> = ({
  studioName, clientName, projectName, location, displayDate,
  snags, totalCount, closedCount, openCount, org,
}) => {
  /* Grouped by room, because that is how the list is walked on site. */
  const byRoom = new Map<string, SnagRow[]>();
  (snags || []).forEach(s => {
    const key = (s.roomName || 'Unassigned').trim() || 'Unassigned';
    const list = byRoom.get(key);
    if (list) list.push(s);
    else byRoom.set(key, [s]);
  });

  return (
    <div
      id="snag-list-render"
      className="w-full max-w-[850px] bg-white text-slate-900 docket-font box-border shadow-md print:shadow-none print:max-w-none"
      style={{ minHeight: '297mm' }}
    >
      <div className="p-8 md:p-12 print:p-0">

        <header className="flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-900">
          <div className="min-w-0">
            {org?.orgLogo
              ? <img src={org.orgLogo} alt={studioName} className="h-10 w-auto max-w-[190px] object-contain object-left mb-2" />
              : <p className="text-[15px] font-bold tracking-tight">{studioName}</p>}
            {org?.officeAddress && <p className="text-[10px] text-slate-500 leading-snug">{org.officeAddress}</p>}
            {org?.contactEmail && <p className="text-[10px] text-slate-500">{org.contactEmail}</p>}
          </div>
          <div className="text-right shrink-0">
            <h1 className="text-[19px] font-bold tracking-tight leading-tight">Snag List &amp; Defect Report</h1>
            <p className="text-[10.5px] text-slate-500 mt-1">Issued {displayDate}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-2 mt-5 text-[11.5px]">
          <div><span className="text-slate-500">Project</span><p className="font-bold">{projectName}</p></div>
          <div><span className="text-slate-500">Client</span><p className="font-bold">{clientName}</p></div>
          {location && <div><span className="text-slate-500">Site</span><p className="font-bold">{location}</p></div>}
          <div>
            <span className="text-slate-500">Items</span>
            <p className="font-bold">
              {totalCount} raised · {closedCount} closed
              {openCount > 0 && <span className="text-rose-700"> · {openCount} still open</span>}
            </p>
          </div>
        </section>

        {/* Stated plainly, because it changes what signing means. */}
        {openCount > 0 && (
          <p className="mt-5 text-[11.5px] text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed">
            <strong>{openCount} item{openCount === 1 ? '' : 's'} on this list {openCount === 1 ? 'remains' : 'remain'} open.</strong>{' '}
            Signing below records that you accept handover with {openCount === 1 ? 'it' : 'them'} outstanding, on the
            understanding that the studio will close {openCount === 1 ? 'it' : 'them'} after possession.
          </p>
        )}

        <section className="mt-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-3">
            1 · Defects raised and their closure
          </h2>

          {totalCount === 0 ? (
            <p className="text-[11.5px] text-slate-600 leading-relaxed">
              No defects were raised during the snagging walk-through of this project.
            </p>
          ) : (
            [...byRoom.entries()].map(([room, items]) => (
              <div key={room} className="mb-5 break-inside-avoid">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 mb-2">
                  {room}
                </p>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-slate-400 text-left">
                      <th className="py-1 pr-2 font-bold w-[46%]">Defect</th>
                      <th className="py-1 pr-2 font-bold">Severity</th>
                      <th className="py-1 pr-2 font-bold">Raised</th>
                      <th className="py-1 pr-2 font-bold">Closed</th>
                      <th className="py-1 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s, i) => {
                      const st = STATUS[s.status] || STATUS.open;
                      return (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="py-1.5 pr-2 text-[11px] text-slate-800">
                            {s.description}
                            {s.notes && <span className="block text-[10px] text-slate-500 italic mt-0.5">{s.notes}</span>}
                          </td>
                          <td className="py-1.5 pr-2 text-[10.5px] text-slate-600">{SEVERITY[s.severity] || '—'}</td>
                          <td className="py-1.5 pr-2 text-[10.5px] text-slate-600 whitespace-nowrap">{d(s.raisedAt)}</td>
                          <td className="py-1.5 pr-2 text-[10.5px] text-slate-600 whitespace-nowrap">{d(s.resolvedAt)}</td>
                          <td className="py-1.5">
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${st.cls}`}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </section>

        <section className="mt-7">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-2">
            2 · Declaration
          </h2>
          <ol className="text-[11.5px] text-slate-800 leading-relaxed space-y-1.5 list-decimal pl-4">
            <li>The client has walked the site and inspected the works listed above.</li>
            <li>
              Every defect recorded during snagging appears on this list. Items marked closed have been
              made good to the client&rsquo;s satisfaction.
            </li>
            <li>
              Items not listed here are not treated as snags. Anything found after signing is handled
              under the warranty terms of the execution agreement, not as an open snag.
            </li>
            <li>
              Signing this report is a pre-requisite to handover. It does not reduce any warranty already
              given, and does not waive a defect that was concealed at the time of inspection.
            </li>
          </ol>
        </section>

      </div>
    </div>
  );
};

export default SnagListSheet;

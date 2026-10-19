import React from 'react';
import { lineRefs, allLines, fmtShortDay, splitPrivate, selectionText, type MinutesContent, type Signed, type CarriedAction, type DesignReviewRecord } from '../../lib/minutes';
import { meetingTypeLabel } from '../../lib/meetingTypes';
import { PDF_CONTENT_WIDTH_PX } from '../../lib/documentPdf';

/*
  THE MINUTES AS A DOCUMENT (mockup 5).

  One layout for download, the email attachment, WhatsApp and the portal,
  drawn on the engine the agreements use (lib/documentPdf.ts): real A4 pages,
  rows never cut in half, a running header and "Page 1 of 2" on every page,
  and the status marked in the margin. In order: in brief, who was present,
  decisions (D1…), actions (A1…) with owner and date, what closed since the
  last meeting, then the signature lines. No money is ever printed.
*/

const OLIVE = '#2f4a2e';
const BRASS = '#8C6A33';

export interface MinutesDocProps {
  studio: { name: string; logo?: string | null; email?: string | null; phone?: string | null };
  projectName: string;
  clientName?: string | null;
  momRef: string;
  rev?: number;
  meeting: { title: string; type: string; date: number; end?: number | null; venue?: string | null };
  content: MinutesContent;
  preparedBy?: Signed | null;
  approvedBy?: Signed | null;
  confirmedBy?: { name: string; at: number } | null;
  issuedAt?: number | null;
  /** True before approval: the PDF is marked as a draft. */
  draft?: boolean;
  /** Design review minutes: the rooms from Design Desk. Revision rounds and fees are never printed. */
  designReview?: DesignReviewRecord | null;
}

const stamp = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const longDay = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function nextLine(n: MinutesContent['nextMeeting']) {
  if (!n?.date) return '';
  const d = new Date(`${n.date}T${n.time || '12:00'}:00+05:30`);
  const day = isNaN(d.getTime()) ? n.date : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return `${day}${n.time && !isNaN(d.getTime()) ? `, ${time(d.getTime())}` : ''}${n.purpose ? ` · ${n.purpose}` : ''}`;
}

const H: React.FC<{ n: string; children: React.ReactNode }> = ({ n, children }) => (
  <div className="flex items-center gap-2 mt-6 mb-2" data-pdf-keep-next>
    <span className="text-[10px] font-bold tabular-nums" style={{ color: BRASS }}>{n}</span>
    <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-800">{children}</h4>
    <span className="flex-1 h-px bg-slate-300" />
  </div>
);

export const MinutesDocument = React.forwardRef<HTMLDivElement, MinutesDocProps>(function MinutesDocument(p, ref) {
  /* Studio-only lines are never printed (lib/minutes splitPrivate). */
  const topics = splitPrivate(p.content.topics).shared;
  const refs = lineRefs(topics);
  const lines = allLines(topics).filter(({ line }) => line.text.trim());
  const selections = lines.filter(({ line }) => line.kind === 'selection');
  const changes = lines.filter(({ line }) => line.kind === 'design_change');
  const requirements = lines.filter(({ line }) => line.kind === 'requirement');
  let section = 1;
  const num = () => String(++section).padStart(2, '0');
  const decisions = lines.filter(({ line }) => line.kind === 'decision');
  const actions = lines.filter(({ line }) => refs[line.id]?.startsWith('A'));
  const notes = lines.filter(({ line }) => line.kind === 'note' || (line.kind === 'question' && !refs[line.id]));
  const present = (p.content.attendees || []).filter((a) => a.present !== false);
  /* A vendor who stayed away is the studio's business. */
  const away = (p.content.attendees || []).filter((a) => a.present === false && a.side !== 'vendor');
  const side = (s: string) => present.filter((a) => (s === 'other' ? !['client', 'ffds'].includes(a.side) : a.side === s));
  const closed = (p.content.carried || []).filter((c: CarriedAction) => c.outcome === 'done');
  const stillOpen = (p.content.carried || []).filter((c: CarriedAction) => c.outcome === 'open');
  const td = 'py-1.5 px-2 align-top border-b border-slate-200';
  const owner = (o?: { side: string; name: string } | null) => (o ? (o.side === 'vendor' ? `${p.studio.name} site team` : `${o.name}${o.side === 'ffds' ? ' (studio)' : ''}`) : '');

  return (
    <div ref={ref} className="bg-white text-slate-800" style={{ width: PDF_CONTENT_WIDTH_PX, padding: '8px 4px 16px' }}>
      <div className="flex items-start justify-between pb-5 border-b-2" style={{ borderColor: OLIVE }}>
        <div>
          {p.studio.logo
            ? <img src={p.studio.logo} alt={p.studio.name} crossOrigin="anonymous" style={{ maxWidth: 150, maxHeight: 56, objectFit: 'contain' }} />
            : <p className="text-lg font-bold uppercase tracking-wide" style={{ color: OLIVE }}>{p.studio.name}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: BRASS }}>Minutes of meeting</p>
          <p className="text-xl font-bold text-slate-900">{p.momRef}</p>
          <p className="text-[11px] text-slate-500">
            {p.draft ? 'Draft, not yet approved' : `Revision ${(p.rev || 0) + 1}${p.issuedAt ? ` · issued ${longDay(p.issuedAt)}` : ''}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-3 mt-5 text-[11px]">
        {([
          ['Project', p.projectName],
          ['Client', p.clientName || ''],
          ['Meeting', `${p.meeting.title || meetingTypeLabel(p.meeting.type)}`],
          ['Date', `${longDay(p.meeting.date)}, ${time(p.meeting.date)}${p.meeting.end ? ` – ${time(p.meeting.end)}` : ''}`],
          ['Venue', p.meeting.venue || ''],
          ['Next meeting', nextLine(p.content.nextMeeting)],
        ] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{k}</p><p className="font-semibold text-slate-800">{v}</p></div>
        ))}
      </div>

      {p.content.revisionNote && (p.rev || 0) > 0 && (
        <p className="mt-4 text-[11px] text-slate-700 border-l-2 pl-3" style={{ borderColor: BRASS }}><b>What changed in this revision:</b> {p.content.revisionNote}</p>
      )}
      {p.content.summary && (
        <div className="mt-5 rounded-lg px-4 py-3 text-[12px] leading-relaxed text-slate-800" style={{ background: '#f7f1e6' }} data-pdf-keep>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: BRASS }}>In brief</p>
          {p.content.summary}
        </div>
      )}

      <H n="01">Present</H>
      <div className="grid grid-cols-3 gap-4 text-[11px] text-slate-700" data-pdf-keep>
        <div><p className="font-bold text-slate-800 mb-0.5">Client</p>{side('client').map((a) => <div key={a.name}>{a.name}</div>)}</div>
        <div><p className="font-bold text-slate-800 mb-0.5">{p.studio.name}</p>{side('ffds').map((a) => <div key={a.name}>{a.name}{a.role ? `, ${a.role}` : ''}</div>)}</div>
        <div>
          {side('other').length > 0 && <><p className="font-bold text-slate-800 mb-0.5">Also present</p>{side('other').map((a) => <div key={a.name}>{a.side === 'vendor' ? `${p.studio.name} site team` : a.name}</div>)}</>}
          {away.length > 0 && <><p className="font-bold text-slate-800 mb-0.5 mt-1">Apologies</p>{away.map((a) => <div key={a.name}>{a.name}</div>)}</>}
        </div>
      </div>

      {(p.designReview?.rooms.length || 0) > 0 && (
        <>
          <H n={num()}>Rooms shown</H>
          <p className="text-[10px] text-slate-500 mb-1.5">
            As recorded at the design review{p.designReview!.heldAt ? ` on ${longDay(p.designReview!.heldAt)}` : ''}
            {p.designReview!.confirmed ? `, confirmed by ${p.designReview!.confirmed.name} on ${stamp(p.designReview!.confirmed.at)}` : ''}. Changes are pinned on the drawings.
          </p>
          <table className="w-full text-[11px] text-slate-800">
            <thead><tr className="text-[9px] uppercase tracking-[0.14em] text-slate-400 text-left"><th className="py-1 px-2 w-32">Room</th><th className="py-1 px-2 w-24">Outcome</th><th className="py-1 px-2">Drawings and changes</th></tr></thead>
            <tbody>
              {p.designReview!.rooms.map((r) => (
                <tr key={r.room}>
                  <td className={`${td} font-semibold`}>{r.room}</td>
                  <td className={td}>{r.outcome === 'agreed' ? 'Agreed' : 'Changes asked'}</td>
                  <td className={td}>
                    <span className="text-slate-500">{r.sheets.map((x) => `${x.name} v${x.versionNo}`).join(' · ')}</span>
                    {r.changes.map((c) => (
                      <div key={c.n} className="mt-0.5"><b style={{ color: BRASS }}>{c.n}.</b> {c.text}{c.sheet ? <span className="text-slate-500"> · {c.sheet}</span> : null}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {decisions.length > 0 && (
        <>
          <H n={num()}>Decisions</H>
          <table className="w-full text-[11px] text-slate-800"><tbody>
            {decisions.map(({ line, topic }) => (
              <tr key={line.id}><td className={`${td} w-10 font-bold`} style={{ color: BRASS }}>{refs[line.id]}</td><td className={`${td} w-32 font-semibold`}>{topic.title}</td><td className={td}>{line.text}</td></tr>
            ))}
          </tbody></table>
        </>
      )}

      {(actions.length > 0 || stillOpen.length > 0) && (
        <>
          <H n={num()}>Actions</H>
          <table className="w-full text-[11px] text-slate-800">
            <thead><tr className="text-[9px] uppercase tracking-[0.14em] text-slate-400 text-left"><th className="py-1 px-2 w-10">#</th><th className="py-1 px-2">Action</th><th className="py-1 px-2 w-36">Owner</th><th className="py-1 px-2 w-24">Due</th></tr></thead>
            <tbody>
              {actions.map(({ line }) => (
                <tr key={line.id}>
                  <td className={`${td} font-bold`} style={{ color: BRASS }}>{refs[line.id]}</td>
                  <td className={td}>{line.kind === 'question' ? `To answer: ${line.text}` : line.text}</td>
                  <td className={`${td} font-semibold`}>{owner(line.owner)}</td>
                  <td className={`${td} tabular-nums`}>{line.due ? fmtShortDay(line.due) : ''}</td>
                </tr>
              ))}
              {stillOpen.map((c, i) => (
                <tr key={`c-${i}`}>
                  <td className={`${td} font-bold`} style={{ color: BRASS }}>{`A${actions.length + i + 1}`}</td>
                  <td className={td}>{c.text} <span className="text-slate-500">(from {c.ref})</span></td>
                  <td className={`${td} font-semibold`}>{c.ownerName}</td>
                  <td className={`${td} tabular-nums`}>{c.due ? fmtShortDay(c.due) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {requirements.length > 0 && (
        <>
          <H n={num()}>What you asked for</H>
          <table className="w-full text-[11px] text-slate-800"><tbody>
            {requirements.map(({ line, topic }) => (
              <tr key={line.id}><td className={`${td} w-10 font-bold`} style={{ color: BRASS }}>{refs[line.id]}</td><td className={`${td} w-32 font-semibold`}>{line.meta?.room || topic.title}</td>
                <td className={td}>{line.text}{line.meta?.priority ? <span className="text-slate-500"> · {line.meta.priority === 'must' ? 'must have' : 'nice to have'}</span> : null}</td></tr>
            ))}
          </tbody></table>
        </>
      )}

      {selections.length > 0 && (
        <>
          <H n={num()}>Selections</H>
          <table className="w-full text-[11px] text-slate-800">
            <thead><tr className="text-[9px] uppercase tracking-[0.14em] text-slate-400 text-left"><th className="py-1 px-2 w-10">#</th><th className="py-1 px-2 w-32">Room</th><th className="py-1 px-2">Choice</th><th className="py-1 px-2 w-28">Status</th></tr></thead>
            <tbody>
              {selections.map(({ line, topic }) => (
                <tr key={line.id}><td className={`${td} font-bold`} style={{ color: BRASS }}>{refs[line.id]}</td><td className={`${td} font-semibold`}>{line.meta?.room || topic.title}</td>
                  <td className={td}>{selectionText({ ...line, meta: { ...line.meta, choice: null } })}</td>
                  <td className={td}>{line.meta?.choice === 'approved' ? 'Approved' : line.meta?.choice === 'on_hold' ? 'On hold' : line.meta?.choice === 'client_to_pick' ? 'Client to pick' : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {changes.length > 0 && (
        <>
          <H n={num()}>Design changes</H>
          <table className="w-full text-[11px] text-slate-800"><tbody>
            {changes.map(({ line, topic }) => (
              <tr key={line.id}><td className={`${td} w-10 font-bold`} style={{ color: BRASS }}>{refs[line.id]}</td><td className={`${td} w-32 font-semibold`}>{line.meta?.room || topic.title}</td>
                <td className={td}>{line.text}{line.meta?.sheet ? <span className="text-slate-500"> · {line.meta.sheet}</span> : null}</td></tr>
            ))}
          </tbody></table>
        </>
      )}

      {notes.length > 0 && (
        <>
          <H n={num()}>Also noted</H>
          <ul className="text-[11px] text-slate-700 space-y-1">
            {notes.map(({ line, topic }) => <li key={line.id}>{topic.title ? <b className="text-slate-800">{topic.title}: </b> : null}{line.kind === 'question' ? `Still open: ${line.text}` : line.text}</li>)}
          </ul>
        </>
      )}

      {closed.length > 0 && (
        <>
          <H n={num()}>Closed since the last meeting</H>
          <ul className="text-[11px] text-slate-700 space-y-1">{closed.map((c, i) => <li key={i}>{c.text} ({c.ref}).</li>)}</ul>
        </>
      )}

      <div className="mt-8 grid grid-cols-3 gap-4 text-[10px] text-slate-600" data-pdf-keep>
        {([
          ['Prepared by', p.preparedBy ? `${p.preparedBy.name}${p.preparedBy.role ? `, ${p.preparedBy.role}` : ''}` : '', p.preparedBy ? stamp(p.preparedBy.at) : ''],
          ['Approved by', p.approvedBy ? `${p.approvedBy.name}${p.approvedBy.role ? `, ${p.approvedBy.role}` : ''}` : '', p.approvedBy ? stamp(p.approvedBy.at) : ''],
          ['Confirmed by client', p.confirmedBy?.name || '', p.confirmedBy ? `In the client portal, ${stamp(p.confirmedBy.at)}` : ''],
        ] as [string, string, string][]).map(([k, who, when]) => (
          <div key={k} className="border-t border-[#d9d6cc] pt-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{k}</p>
            <p className="font-semibold text-slate-800 text-[11px] min-h-[16px]">{who}</p>{when}
          </div>
        ))}
      </div>
      <p className="mt-6 text-[10px] text-slate-500 leading-relaxed">
        These minutes are the studio's record of the meeting. If anything is not as you remember it, mark the line in your client portal and we will correct it.
      </p>
      {(p.studio.email || p.studio.phone) && (
        <p className="mt-4 pt-2 border-t border-slate-200 text-[9px] text-slate-400">{[p.studio.name, p.studio.email, p.studio.phone].filter(Boolean).join(' · ')}</p>
      )}
    </div>
  );
});

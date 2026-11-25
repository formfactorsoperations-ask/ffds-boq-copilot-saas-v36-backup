import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, PanelRight, FileText, Globe, IndianRupee, PenTool, MapPin, NotebookPen, Info, MessagesSquare, Reply } from '@/lib/lucide-shim';
import { Button, Chip, EmptyState, INPUT, LABEL, Segmented, type Tone } from '../ui/kit';
import { Dot } from '../ui/HudBits';
import type { FullProjectData } from '../../types';
import type { ClientMoney } from '../../lib/clientMoney';
import type { ClientRow } from '../../lib/clientList';
import type { TemplateId } from '../../lib/clientNextMove';
import { buildThread, groupThread, SOURCE_LABEL, type ThreadEntry, type ThreadRecords, type ThreadSource } from '../../lib/clientThread';
import { REPLY_FROM, REPLY_MOODS, noteLine, replyLine, sendSubject, sentLine, type FollowUpLine, type ReplyFrom, type ReplyMood } from '../../lib/clientCompose';
import { ClientPhoto, KindSticker, LiveDot, WHATSAPP_TEMPLATES, daysAgo, whatsAppLink } from './parts';
import type { PortalLine, PortalVisit } from '../../lib/portalVisits';

/*
  The middle pane (DESIGN.md "Clients: conversations"): the client's header,
  the permanent "Not live chat" strip, the thread worked out from StudioDesk's
  records (lib/clientThread), and the message to send next from a template.

  What the studio sent sits on the right in brand; what the client said, in a
  white quoted bubble on the left; everything else is a card with its source
  chip (an icon and a label, never colour alone), on the side of whoever did
  it. Milestones are stickers, centred.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const SOURCE: Record<ThreadSource, { icon: React.ElementType; tone: Tone; gold?: boolean }> = {
  sent: { icon: MessageCircle, tone: 'brand' },
  proposals: { icon: FileText, tone: 'brand' },
  portal: { icon: Globe, tone: 'brand' },
  payments: { icon: IndianRupee, tone: 'good' },
  design: { icon: PenTool, tone: 'slate', gold: true },
  site: { icon: MapPin, tone: 'warn' },
  team: { icon: NotebookPen, tone: 'slate' },
};
const GOLD = '!bg-[#B8923A]/15 !text-[#8C6D2A]';

function SourceChip({ source }: { source: ThreadSource }) {
  const s = SOURCE[source];
  const Icon = s.icon;
  return (
    <Chip tone={s.tone} className={s.gold ? GOLD : undefined}>
      <Icon className="w-3 h-3" aria-hidden />{SOURCE_LABEL[source]}
    </Chip>
  );
}

/* The sticker faces (DESIGN.md "Stickers"): gold for a signature, rose for unpaid, amber for no reply. */
const STICKER: Record<'gold' | 'bad' | 'warn', React.CSSProperties> = {
  gold: { color: '#8C6D2A', background: 'linear-gradient(180deg, #fffbeb, #f6ead0)' },
  bad: { color: '#be123c', background: 'linear-gradient(180deg, #fff1f2, #ffe4e6)' },
  warn: { color: '#b45309', background: 'linear-gradient(180deg, #fffbeb, #fef3c7)' },
};

function Sticker({ entry, tilt }: { entry: ThreadEntry; tilt: number }) {
  const slap = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.classList.remove('slap');
    void el.offsetWidth;
    el.classList.add('slap');
  };
  return (
    <div className="pj flex justify-center py-1">
      <span role="img" tabIndex={0} className="pj-stk" style={{ ['--r' as any]: `${tilt}deg` }} aria-label={entry.text} data-tip={entry.projectName || entry.text} onClick={slap}>
        <span className="pj-face !text-[11px] !px-2.5 !py-1" style={STICKER[entry.tone || 'warn']}>{entry.text}</span><span className="pj-fold" />
      </span>
    </div>
  );
}

const timeOf = (at: number, now: number) => {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };
  const day = new Date(at).toLocaleDateString('en-IN', { ...opts, day: 'numeric', month: 'short' });
  const hm = new Date(at).toLocaleTimeString('en-IN', { ...opts, hour: 'numeric', minute: '2-digit' });
  return sameDay || now - at < 6 * 86400000 ? `${sameDay ? '' : `${day}, `}${hm}` : day;
};

function Entry({ e, now }: { e: ThreadEntry; now: number }) {
  const tag = e.projectName ? <span className="text-[11px] font-semibold text-slate-500">· {e.projectName}</span> : null;
  if (e.kind === 'sent') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-[#3D52A0] text-white px-4 py-3 shadow-sm">
          <p className="text-sm whitespace-pre-wrap break-words">{e.text}</p>
          <p className="mt-1.5 text-[11px] text-white/75 text-right">{e.meta} · {timeOf(e.at, now)}{e.projectName ? ` · ${e.projectName}` : ''}</p>
          {e.template && <span className="mt-2 inline-flex px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider">{e.template}</span>}
        </div>
      </div>
    );
  }
  if (e.kind === 'said') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md bg-white border border-dashed border-slate-300 px-4 py-3">
          <p className="text-sm italic text-slate-700 whitespace-pre-wrap break-words">“{e.text}”</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {e.source && <SourceChip source={e.source} />}
            <span className="text-[11px] text-slate-500">{e.meta} · {timeOf(e.at, now)}</span>{tag}
          </p>
        </div>
      </div>
    );
  }
  const s = e.source ? SOURCE[e.source] : null;
  const Icon = s?.icon || Info;
  return (
    <div className={cx('flex', e.side === 'studio' ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%] sm:max-w-[75%] bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex gap-3">
        <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', s?.gold ? 'bg-[#B8923A]/15 text-[#8C6D2A]' : s?.tone === 'good' ? 'bg-emerald-100 text-emerald-700' : s?.tone === 'warn' ? 'bg-amber-100 text-amber-700' : s?.tone === 'brand' ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-500')}>
          <Icon className="w-4 h-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 break-words">{e.text}</p>
          {e.detail && <p className="text-xs text-slate-500 mt-0.5 break-words">{e.detail}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {e.source && <SourceChip source={e.source} />}
            <span className="text-[11px] text-slate-500">{e.meta ? `${e.meta} · ` : ''}{timeOf(e.at, now)}</span>{tag}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ClientThreadPane({ row, now, studioName, money, records, loading, canLog, onLog, onOpenProject, onBack, onDetails, portalVisits = [], portalLine = null }: {
  row: ClientRow;
  now: number;
  studioName: string;
  /** Each project's money as the client sees it, already without amounts where they are hidden. */
  money: Record<string, ClientMoney | null>;
  /** The client's records, once read; null while they load. */
  records: ThreadRecords | null;
  loading: boolean;
  /** May write to the follow-up log (every studio role but Viewer: firestore.rules mayWriteOps). */
  canLog: boolean;
  /** Writes one line to a project's follow-up log; resolves once it is saved. */
  onLog: (projectId: string, line: FollowUpLine) => Promise<void>;
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  /** Below 768px: back to the list. */
  onBack: () => void;
  /** Below 1024px: the client card, as a drawer. */
  onDetails: () => void;
  /** Their portal visits, for the thread; none for a Viewer. */
  portalVisits?: PortalVisit[];
  /** The client's best portal line: the header says so when they are on the portal now. */
  portalLine?: PortalLine | null;
}) {
  const c = row.client;
  const home = row.primary?.context?.name || 'Untitled project';
  const projects = useMemo(
    () => [row.primary, ...c.projects.filter((p) => p.id !== row.primary.id)],
    [c.projects, row.primary],
  );

  const thread = useMemo(() => records ? buildThread({
    clientName: c.clientName,
    projects: projects.map((p) => ({ id: p.id, name: p.context?.name || 'Untitled project', context: p.context })),
    money,
    records,
    portalVisits,
    now,
  }) : [], [records, projects, money, c.clientName, now, portalVisits]);
  const groups = useMemo(() => groupThread(thread, now), [thread, now]);

  /* The latest is at the bottom, so the thread opens there. */
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, c.clientKey]);

  /* The template Next move suggests is chosen first; the message follows the template and the project. */
  const [template, setTemplate] = useState<TemplateId>(row.nextMove.template);
  const [projectId, setProjectId] = useState(row.primary.id);
  const [text, setText] = useState('');
  useEffect(() => { setTemplate(row.nextMove.template); setProjectId(row.primary.id); }, [c.clientKey, row.nextMove.template, row.primary.id]);
  const project = projects.find((p) => p.id === projectId) || row.primary;
  useEffect(() => {
    const t = WHATSAPP_TEMPLATES.find((x) => x.id === template) || WHATSAPP_TEMPLATES[0];
    setText(t.text(c.clientName, studioName, project?.context?.name || 'your interior project'));
  }, [template, project?.id, c.clientName, studioName]);

  const link = whatsAppLink(c.clientPhone, text);

  /*
    What the composer writes (lib/clientCompose): the send, a reply, a note.
    WhatsApp opens first, on the click itself, so the browser does not block
    it; the line is then logged. A line that could not be saved says so, with
    a retry: the bubble only ever says "logged" for a line that was.
  */
  const [mode, setMode] = useState<'send' | 'reply' | 'note'>('send');
  const [mood, setMood] = useState<ReplyMood>('positive');
  const [said, setSaid] = useState('');
  const [from, setFrom] = useState<ReplyFrom>('whatsapp');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<{ projectId: string; line: FollowUpLine; what: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { setMode('send'); setSaid(''); setNoteText(''); setFailed(null); setSaved(null); }, [c.clientKey]);
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(null), 2500);
    return () => window.clearTimeout(t);
  }, [saved]);

  const log = async (projectId: string, line: FollowUpLine, what: string): Promise<boolean> => {
    setSaving(true);
    setFailed(null);
    try {
      await onLog(projectId, line);
      setSaved(what);
      return true;
    } catch (e: any) {
      console.warn('Clients: log', e?.code || e);
      setFailed({ projectId, line, what });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const send = () => {
    if (!link || !text.trim()) return;
    window.open(link, '_blank', 'noopener,noreferrer');
    if (!canLog) return;
    const t = WHATSAPP_TEMPLATES.find((x) => x.id === template) || WHATSAPP_TEMPLATES[0];
    void log(project.id, sentLine(text, sendSubject(t, money[project.id]?.milestones || [])), 'Message logged');
  };
  const saveReply = async () => {
    if (await log(project.id, replyLine(mood, said, from), 'Reply logged')) { setSaid(''); setMode('send'); }
  };
  const saveNote = async () => {
    if (!noteText.trim()) return;
    if (await log(project.id, noteLine(noteText), 'Note added')) { setNoteText(''); setMode('send'); }
  };
  const projectPicker = projects.length > 1 && (
    <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="About which project" className={`${INPUT} !py-1.5 text-xs`}>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.context?.name || 'Untitled project'}</option>)}
    </select>
  );
  const total = thread.length;
  let n = 0;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <button type="button" onClick={onBack} aria-label="Back to clients" className="md:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <ClientPhoto project={row.primary} className="w-11 h-11 rounded-xl overflow-hidden" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900 truncate">{c.clientName}</h2>
          {portalLine?.live ? (
            <p className="text-xs font-semibold text-[#3D52A0] truncate flex items-center gap-1.5"><LiveDot /> {portalLine.text}</p>
          ) : (
            <p className="text-xs text-slate-500 truncate">
              {home} · {row.lastContactAt != null ? `last contact ${daysAgo(row.lastContactAt, now)}` : 'no contact logged yet'}
            </p>
          )}
        </div>
        <span className="hidden sm:inline-flex"><KindSticker isDummy={c.isDummy} /></span>
        <Button size="sm" icon={PanelRight} onClick={onDetails} className="lg:hidden">Details</Button>
      </div>

      {/* Permanent: this is a record, not a chat. */}
      <p className="flex items-start gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50 text-xs text-slate-600">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" aria-hidden />
        <span><b className="font-bold text-slate-700">Not live chat.</b> Built from StudioDesk records. Their WhatsApp replies appear only when someone logs them.</span>
      </p>

      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/60">
        {loading && !records ? (
          <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 py-2"><Dot tone="warn" live /> Reading their records…</div>
        ) : total === 0 ? (
          <EmptyState icon={MessagesSquare} title="Nothing recorded yet"
            text="Messages sent, replies logged, payments, visits and sign-offs appear here as StudioDesk records them." />
        ) : groups.map((g) => (
          <section key={g.group} className="space-y-3" aria-label={g.group}>
            <div className="flex justify-center">
              <span className="px-3 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-500">{g.group}</span>
            </div>
            {g.entries.map((e) => {
              const i = n++;
              const delay = i >= total - 12 ? (i - (total - 12)) * 35 : 0;
              return (
                <div key={e.id} className="hud-row-in" style={{ animationDelay: `${delay}ms` }}>
                  {e.kind === 'sticker' ? <Sticker entry={e} tilt={i % 2 ? 3 : -3} /> : <Entry e={e} now={now} />}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="border-t border-slate-100 p-3 space-y-2.5 bg-white">
        {mode === 'send' && (
          <>
            <Segmented<TemplateId> label="Message template" size="sm" value={template} onChange={setTemplate}
              options={WHATSAPP_TEMPLATES.map((t) => ({ id: t.id, label: t.title }))} />
            <div className="flex flex-col xl:flex-row gap-2.5">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Message"
                className={`${INPUT} resize-none flex-1`} />
              <div className="flex flex-wrap items-center xl:flex-col xl:items-stretch xl:flex-nowrap gap-2 xl:w-48 shrink-0">
                {projectPicker}
                <Button variant="primary" icon={MessageCircle} disabled={!link || !text.trim() || saving}
                  title={link ? (canLog ? 'Opens WhatsApp with this message and logs it' : 'Opens WhatsApp with this message') : 'Add a phone number first'}
                  onClick={send}>
                  Open in WhatsApp
                </Button>
                {!c.clientPhone && (
                  <button type="button" onClick={() => onOpenProject(row.primary)} className="text-xs font-bold text-[#3D52A0] hover:underline self-center">
                    Add phone
                  </button>
                )}
                {canLog && <Button icon={Reply} onClick={() => setMode('reply')}>Log their reply</Button>}
                {canLog && <Button variant="quiet" size="sm" icon={NotebookPen} onClick={() => setMode('note')}>Add a note</Button>}
              </div>
            </div>
          </>
        )}

        {mode === 'reply' && (
          <div className="space-y-2.5 hud-swap">
            <p className={LABEL}>How did they reply?</p>
            <Segmented<ReplyMood> label="How did they reply?" size="sm" value={mood} onChange={setMood} options={REPLY_MOODS} />
            <textarea value={said} onChange={(e) => setSaid(e.target.value)} rows={2} aria-label="What they said"
              placeholder={mood === 'none' ? 'Anything to add (optional)' : 'What they said, in their words'} className={`${INPUT} resize-none`} />
            <div className="flex flex-wrap items-center gap-2">
              <span className={LABEL}>From</span>
              <Segmented<ReplyFrom> label="Where they replied" size="sm" value={from} onChange={setFrom} options={REPLY_FROM} />
              {projectPicker}
              <span className="flex-1" />
              <Button onClick={() => setMode('send')} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={saveReply} disabled={saving}>{saving ? 'Saving…' : 'Log reply'}</Button>
            </div>
          </div>
        )}

        {mode === 'note' && (
          <div className="space-y-2.5 hud-swap">
            <p className={LABEL}>A note for the team</p>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} aria-label="Note"
              placeholder="What the team should know about this client" className={`${INPUT} resize-none`} />
            <div className="flex flex-wrap items-center gap-2">
              {projectPicker}
              <span className="flex-1" />
              <Button onClick={() => setMode('send')} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={saveNote} disabled={saving || !noteText.trim()}>{saving ? 'Saving…' : 'Add note'}</Button>
            </div>
          </div>
        )}

        {failed && (
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rose-700" role="alert">
            Not logged: the follow-up could not be saved.
            <Button size="sm" variant="danger" disabled={saving} onClick={() => log(failed.projectId, failed.line, failed.what)}>Try again</Button>
          </p>
        )}
        {saved && !failed && <p className="text-xs font-semibold text-emerald-700" role="status">{saved}. It is on the Ops Desk too.</p>}
        {!canLog && mode === 'send' && <p className="text-[11px] text-slate-500">Viewers can open WhatsApp from here; what is sent is not logged.</p>}
      </div>
    </div>
  );
}

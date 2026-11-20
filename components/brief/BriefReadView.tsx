import React, { useRef, useState } from 'react';
import {
  FileText, Map as MapIcon, Upload, ExternalLink, Pencil, Check, User, Home, Wallet, List, Plus, Minus, ListChecks,
} from '@/lib/lucide-shim';
import type { ProjectContext } from '../../types';
import { Panel, Button, Chip, EmptyState, LABEL } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import ProjectContextCard, { useAutoMapRooms, type BriefPart } from '../ProjectContextCard';
import { useOrg } from '../../contexts/OrgContext';
import { briefGaps, briefCompleteness, clientPlanOf, readScope, roomsArea, type BriefGap, type ScopeReading } from '../../lib/briefRead';
import { pendingSuggestions, applySuggestions } from '../../lib/civilScope';
import { realRooms } from '../../lib/scopeBuckets';
import { engagementDef, engagementOf } from '../../lib/engagement';
import { downscalePlanToBase64 } from '../../lib/imageDownscale';
import { uploadPlanImage } from '../../services/planStorage';

/*
  Brief & Site, read first (the owner chose option C of the brief redesign,
  20 Nov 2026).

  The screen used to be one long form: thirty-odd inputs in nine cards of the
  same weight, nothing reading back what had been collected. It now opens as a
  read of the brief: the client's words, how the studio read them into the
  civil scope, the client's floor plan, the home as facts, the rooms, and what
  is still missing (the floor plan first: the studio does not go ahead without
  it). Every block has Edit, which opens that part of the old form in place
  (ProjectContextCard `only`), so no field and no rule is lost.

  Built from the screen kit (DESIGN.md): Panel, Chip, Button, EmptyState,
  CountUp, and the existing motion classes only.
*/

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  projectId?: string;
}

const SITE_STATE: Record<string, string> = { raw_shell: 'Raw shell', semi_finished: 'Semi-finished', finished: 'Finished (refit only)' };
const nf = new Intl.NumberFormat('en-IN');

function feeText(ctx: ProjectContext): string {
  const fee = Number(ctx.designFee ?? 0);
  if ((ctx.designFeeType || 'percentage') === 'percentage') return `${fee || 10}% of cost`;
  if (ctx.designFeeType === 'fixed_sqft') return `₹${nf.format(fee)}/sq ft`;
  return `₹${nf.format(fee)} fixed`;
}

/** A label and its value; a missing value reads as missing rather than as a blank. */
const Fact: React.FC<{ label: string; value?: React.ReactNode; missing?: boolean }> = ({ label, value, missing }) => (
  <div className="min-w-0">
    <dt className={LABEL}>{label}</dt>
    <dd className={`mt-0.5 text-sm truncate ${missing ? 'text-amber-700 font-semibold' : 'text-slate-800 font-semibold'}`}>{missing ? 'Missing' : value}</dd>
  </div>
);

/** The completeness ring: the brand stroke on a slate track, the figure counting up. */
const Ring: React.FC<{ pct: number }> = ({ pct }) => {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <span className="relative w-14 h-14 shrink-0 grid place-items-center" aria-label={`${pct}% of the brief is in`}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-slate-200" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" stroke="#3D52A0"
          strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray 600ms ease' }} />
      </svg>
      <span className="text-xs font-black text-slate-800 tabular-nums"><CountUp value={pct} />%</span>
    </span>
  );
};

const why = (row: ScopeReading): string => row.why.kind === 'site' ? 'from the site state'
  : row.why.kind === 'hand' ? 'set by hand'
  : row.on ? 'on by default; the brief does not say' : 'not in the brief';

export default function BriefReadView({ projectContext: ctx, setProjectContext, projectId }: Props) {
  const { orgData } = useOrg();
  const [editing, setEditing] = useState<BriefPart | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planNote, setPlanNote] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const planRef = useRef<HTMLDivElement | null>(null);

  /* The form used to map the rooms on opening; the read view keeps doing it. */
  useAutoMapRooms(ctx, setProjectContext);

  const gaps = briefGaps(ctx);
  const done = briefCompleteness(ctx);
  const plan = clientPlanOf(ctx);
  const scope = readScope(ctx);
  const pending = pendingSuggestions(ctx);
  const area = roomsArea(ctx);
  const rooms = realRooms(ctx.rooms);
  const first = String(ctx.clientName || '').trim().split(/\s+/)[0] || 'the client';
  const words = String(ctx.clientBrief || '').trim();
  const missing = (key: string) => gaps.some(g => g.key === key);
  const classified = typeof ctx.isDummy === 'boolean' ? (ctx.isDummy ? 'Dummy' : 'Actual project')
    : ctx.projectCategory === 'dummy' ? 'Dummy' : ctx.projectCategory === 'actual' ? 'Actual project' : null;

  const open = (part: BriefPart) => setEditing(p => (p === part ? null : part));
  const goTo = (gap: BriefGap) => {
    if (gap.part === 'plan') {
      planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fileRef.current?.click();
      return;
    }
    setEditing(gap.part);
  };

  /* One part of the old form, in place of the block's read. */
  const editor = (...parts: BriefPart[]) => (
    <div className="space-y-6">
      {parts.map(part => (
        <ProjectContextCard key={part} only={part} projectContext={ctx} setProjectContext={setProjectContext}
          aiStrategy="balanced" hideExecutionControls projectId={projectId} />
      ))}
    </div>
  );
  const editButton = (part: BriefPart, label = 'Edit') => editing === part
    ? <Button size="sm" variant="primary" icon={Check} onClick={() => setEditing(null)}>Done</Button>
    : <Button size="sm" variant="quiet" icon={Pencil} onClick={() => open(part)}>{label}</Button>;

  const onPlanFile = async (file: File | undefined) => {
    if (!file) return;
    setPlanBusy(true); setPlanNote(null);
    try {
      const base64 = await downscalePlanToBase64(file);
      const url = await uploadPlanImage(orgData?.tenantId, base64);
      setProjectContext(p => ({ ...p, floorplanImageUrl: url, floorplanImage: undefined }));
      setPlanNote({ tone: 'good', text: 'The client’s floor plan is saved with the project. Read the rooms off it in the BOQ Editor’s plan.' });
    } catch (e: any) {
      setPlanNote({ tone: 'bad', text: `The plan could not be saved: ${e?.message || e}. Try again.` });
    } finally {
      setPlanBusy(false);
    }
  };

  /*
    The narrow column's parts open full width under their row: the client's
    fields and contacts, the option grids and the fee engine need the room.
  */
  const WIDE: Partial<Record<BriefPart, { title: string; icon: React.ElementType; parts: BriefPart[] }>> = {
    client: { title: 'Client', icon: User, parts: ['client', 'classification'] },
    home: { title: 'The home', icon: Home, parts: ['home'] },
    fees: { title: 'Engagement & fees', icon: Wallet, parts: ['engagement', 'fees'] },
  };
  const wideEditor = (row: BriefPart[]) => {
    const part = row.find(p => p === editing);
    const w = part && WIDE[part];
    if (!part || !w) return null;
    return (
      <Panel icon={w.icon} title={`Editing: ${w.title}`} blurb="Changes save as you go."
        aside={<Button size="sm" variant="primary" icon={Check} onClick={() => setEditing(null)}>Done</Button>}>
        {editor(...w.parts)}
      </Panel>
    );
  };
  const editingHere = (part: BriefPart) => editing === part && !!WIDE[part];

  const required = gaps.filter(g => g.required);
  const optional = gaps.filter(g => !g.required);

  return (
    <div className="space-y-6 w-full">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        {/* The client's words, and how the studio read them. */}
        <Panel icon={FileText} title={`What ${first} told us`}
          blurb={(ctx as any).leadId ? 'From the lead, and what was added from the discovery minutes' : 'In the client’s own words'}
          aside={editButton('brief', words ? 'Edit' : 'Write it')}>
          {editing === 'brief' ? editor('brief') : (
            <div className="space-y-5">
              {words
                ? <p className="text-base font-semibold text-slate-800 leading-relaxed whitespace-pre-line hud-swap">“{words}”</p>
                : <EmptyState icon={FileText} title="No requirement written yet" text="Write what the client asked for, in their words. The civil scope is read from it." />}

              <div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
                  <span className={LABEL}>How we read it</span>
                  <div className="flex items-center gap-2">
                    {pending.length > 0 && editing !== 'site' && (
                      <Button size="sm" variant="primary" onClick={() => setProjectContext(p => ({ ...p, civilScope: applySuggestions(p, pendingSuggestions(p)) }))}>
                        Apply what the brief says ({pending.length})
                      </Button>
                    )}
                    {editButton('site', 'Edit scope')}
                  </div>
                </div>
                {editing === 'site' ? editor('site') : (
                  <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {scope.map((row, i) => (
                      <li key={row.key} className="px-4 py-2.5 flex items-start gap-3 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
                        <span className={`mt-0.5 w-5 h-5 rounded-md grid place-items-center shrink-0 ${row.on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {row.on ? <Plus className="w-3 h-3" aria-label="In scope" /> : <Minus className="w-3 h-3" aria-label="Not in scope" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`text-sm font-semibold ${row.on ? 'text-slate-800' : 'text-slate-500'}`}>{row.label}</span>
                          <span className="block text-xs text-slate-500">
                            {row.why.kind === 'brief' ? <>from “{row.why.quote}”</> : why(row)}
                          </span>
                        </span>
                        {row.briefDisagrees && <Chip tone="warn" title={`The brief says: “${row.briefDisagrees}”`}>Brief says otherwise</Chip>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          {/* How much of the brief is in, and what is still missing. */}
          <Panel icon={ListChecks} title="The brief" delay={30}
            blurb={gaps.length ? `${done.done} of ${done.total} in` : 'Everything is in'}
            aside={<Ring pct={done.pct} />}>
            {gaps.length === 0 ? (
              <p className="text-xs text-slate-500">The client, the home, their words, the floor plan and the rooms are all in.</p>
            ) : (
              <div className="space-y-3">
                {required.length > 0 && (
                  <div>
                    <p className={`${LABEL} mb-1.5`}>Needed to go ahead</p>
                    <div className="flex flex-wrap gap-1.5">
                      {required.map(g => (
                        <button key={g.key} type="button" onClick={() => goTo(g)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30">
                          <Chip tone="warn">{g.label}</Chip>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {optional.length > 0 && (
                  <div>
                    <p className={`${LABEL} mb-1.5`}>Also missing</p>
                    <div className="flex flex-wrap gap-1.5">
                      {optional.map(g => (
                        <button key={g.key} type="button" onClick={() => goTo(g)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30">
                          <Chip tone="slate">{g.label}</Chip>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* Who the client is. */}
          <Panel icon={User} title="Client" delay={60} aside={editButton('client')}>
            {editingHere('client') ? <p className="text-xs text-slate-500">Open below.</p> : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label="Name" value={ctx.clientName} missing={missing('clientName')} />
                <Fact label="Phone" value={ctx.clientPhone} missing={missing('clientPhone')} />
                <div className="col-span-2"><Fact label="Email" value={ctx.clientEmail} missing={missing('clientEmail')} /></div>
                <Fact label="Others on the client’s side" value={((ctx as any).clientContacts || []).length || 'None'} />
                <Fact label="Project" value={classified} missing={!classified} />
              </dl>
            )}
          </Panel>
        </div>
      </div>
      {wideEditor(['client'])}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        {/* The client's floor plan: where it can be seen and replaced. */}
        <div ref={planRef} className="min-w-0">
          <Panel icon={MapIcon} title="The client’s floor plan"
            badge={plan ? <Chip tone="good">{plan.from === 'brief' ? 'With the brief' : 'Uploaded in the BOQ Editor'}</Chip> : <Chip tone="warn">Needed</Chip>}
            blurb="The drawing the client gave. The BOQ Editor’s plan reads its rooms and puts the BOQ on it."
            aside={
              <>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" aria-label="Upload the client’s floor plan"
                  onChange={e => { onPlanFile(e.target.files?.[0]); e.target.value = ''; }} />
                {plan && <a href={plan.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#3D52A0] hover:bg-[#3D52A0]/10"><ExternalLink className="w-3.5 h-3.5" aria-hidden />Open full size</a>}
                <Button size="sm" variant={plan ? 'secondary' : 'primary'} icon={Upload} onClick={() => fileRef.current?.click()} disabled={planBusy}>
                  {planBusy ? 'Saving…' : plan ? 'Replace' : 'Upload the plan'}
                </Button>
              </>
            }>
            {plan ? (
              plan.pdf ? (
                <EmptyState icon={FileText} title="The plan is a PDF" text="Open it full size to read it. The BOQ Editor draws page 1 as an image when you set up the plan." />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden hud-swap" key={plan.url}>
                  <img src={plan.url} alt="The client’s floor plan" className="block w-full max-h-[480px] object-contain" />
                </div>
              )
            ) : (
              <EmptyState icon={MapIcon} title="No floor plan from the client yet"
                text="Ask the client for it. The studio does not go ahead without the client’s floor plan. An image or a PDF." />
            )}
            {planNote && <p role="status" className={`mt-3 text-xs ${planNote.tone === 'bad' ? 'text-rose-700' : 'text-emerald-700'}`}>{planNote.text}</p>}
          </Panel>
        </div>

        <div className="space-y-6">
          {/* The home, as facts. */}
          <Panel icon={Home} title="The home" delay={30} aside={editButton('home')}>
            {editingHere('home') ? <p className="text-xs text-slate-500">Open below.</p> : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label="Configuration" value={ctx.config} missing={missing('config')} />
                <Fact label="Area" value={ctx.area ? `${nf.format(ctx.area)} sq ft` : ''} missing={missing('area')} />
                <Fact label="Site state" value={SITE_STATE[ctx.propertyStatus || ''] || ctx.propertyStatus} missing={missing('propertyStatus')} />
                <Fact label="Style" value={<span className="capitalize">{ctx.theme}</span>} missing={missing('theme')} />
                <div className="col-span-2"><Fact label="Site" value={ctx.location} missing={missing('location')} /></div>
              </dl>
            )}
          </Panel>

          {/* What the studio has been engaged to do, and for what. */}
          <Panel icon={Wallet} title="Engagement & fees" delay={60} aside={editButton('fees')}>
            {editingHere('fees') ? <p className="text-xs text-slate-500">Open below.</p> : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label="Engagement" value={engagementDef(engagementOf(ctx)).label} />
                <Fact label="Design fee" value={feeText(ctx)} />
                <div className="col-span-2">
                  <Fact label="Deliverables" value={[
                    ctx.designScope?.has3DRenders && '3D views', ctx.designScope?.has2DDrawings && 'GFC drawings',
                    ctx.designScope?.hasFurnitureSelection && 'Furniture spec', ctx.designScope?.hasVrWalkthrough && 'VR walkthrough',
                    ctx.designScope?.hasSiteVisits && `${ctx.designScope?.visitCount || 0} site visits`,
                  ].filter(Boolean).join(' · ') || 'None chosen'} />
                </div>
              </dl>
            )}
          </Panel>
        </div>
      </div>

      {wideEditor(['home', 'fees'])}

      {/* The rooms. */}
      <Panel id="dimensional-space-planner" icon={List} title="Rooms"
        blurb={area.count ? `${area.count} rooms · ${nf.format(area.sqft)} of ${nf.format(area.area)} sq ft` : 'No rooms yet'}
        aside={editButton('rooms')}>
        {editing === 'rooms' ? editor('rooms') : area.count === 0 ? (
          <EmptyState icon={List} title="No rooms yet" text="They are read off the floor plan, mapped from the configuration and area, or added by hand." />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {rooms.map((r, i) => (
              <li key={`${r.name}-${i}`} className="rounded-xl border border-slate-200 px-3 py-2 min-w-0 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <span className="block text-sm font-semibold text-slate-800 truncate">{r.name}</span>
                <span className="block text-xs text-slate-500 tabular-nums">
                  {r.length && r.width ? `${r.length} × ${r.width} ft · ` : ''}{nf.format(Math.round(Number(r.size) || 0))} sq ft
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

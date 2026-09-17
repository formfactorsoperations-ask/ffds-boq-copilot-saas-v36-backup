import React, { useEffect, useState } from 'react';
import { Globe, AtSign } from 'lucide-react';
import { COLOR_TOKENS } from '../../lib/UIConstants';
import { formatINR } from '../../lib/utils';
import { ClientActionItem, ClientActionSummary, ClientLifecycleSummary } from '../../services/clientPortalEngine';
import PortalSpine from './PortalSpine';
import { AttachmentKind, SpinePhase } from './spineModel';

/**
 * The client's overview: a hero that greets them, a catch-up they can open, and
 * the project running down the page as a spine.
 *
 * The version this replaces opened straight on an eyebrow and an H1 with no
 * greeting at all, then showed "Where we are" as six horizontal bars — a strip
 * with room for a stage name and nothing else, which is why documents,
 * decisions and payments had to be filed on separate screens. Attaching them to
 * the stage they belong to is the point of the spine; the horizontal strip was
 * the same idea with the information taken out.
 *
 * Every figure and every row is passed in. Nothing here derives its own numbers.
 */

interface StudioProfile {
  name: string;
  tagline?: string;
  about?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  logoUrl?: string;
  pmName?: string;
  pmRole?: string;
  website?: string;
  instagramUrl?: string;
  /** Image the studio uploaded in Studio Settings, not generated here. */
  instagramQr?: string;
  businessHours?: string;
  siteVisitPolicy?: string;
  escalationPolicy?: string;
  credentials?: string[];
  pmResponseTime?: string;
}

interface Props {
  clientName?: string;
  studio: StudioProfile;
  lifecycle: ClientLifecycleSummary;
  actions: ClientActionSummary;
  phases: SpinePhase[];
  filter: AttachmentKind | 'all';
  catchUp: { lead: string; lines: { bold: string; rest: string }[] };
  /** Handover month where the programme gives one — omitted, not guessed. */
  projectValue: number;
  totalPaid: number;
  balanceDue: number;
  overdueCount: number;
  /** The hero owns this toggle; the panel lives here, under the lens bar. */
  catchOpen: boolean;
  onClearFilter: () => void;
  onOpenTab: (tab: string) => void;
  onRunAction: (item: ClientActionItem) => void;
  onContactStudio: () => void;
  successMessage?: string | null;
  onDismissSuccess?: () => void;
}

const WAVE_DELAY = 55;

/** Characters ripple in place — the app's own .page-header-wave treatment. */
const Wave: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <span className={`page-header-wave ${className}`} aria-label={text}>
    {Array.from(text).map((ch, i) => (
      <span key={`${ch}-${i}`} aria-hidden="true" style={{ animationDelay: `${i * WAVE_DELAY}ms` }}>
        {ch}
      </span>
    ))}
  </span>
);

/** Counts up to the figure once. A number that lands is read; one that is
    already there is skimmed. */
const Count: React.FC<{ to: number; className?: string }> = ({ to, className }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (to <= 0) { setN(0); return; }
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className={className}>{formatINR(n)}</span>;
};

export default function PortalOverview({
  clientName, studio, lifecycle, actions, phases, filter, catchOpen,
  catchUp, projectValue, totalPaid, balanceDue, overdueCount,
  onOpenTab, onRunAction, onClearFilter, onContactStudio, successMessage, onDismissSuccess,
}: Props) {

  const needsYou = actions.clientActions;
  const paidPct = projectValue > 0 ? Math.min(100, Math.round((totalPaid / projectValue) * 100)) : 0;

  return (
    <div className="space-y-7">
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-bold text-emerald-900">{successMessage}</p>
          {onDismissSuccess && (
            <button onClick={onDismissSuccess} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer">
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Catch-up. Collapsed by default: a client who is here every day should
          not have to scroll past a recap they already know. */}
      <div className={`grid transition-all duration-500 ease-out ${catchOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="rounded-2xl bg-sky-50/70 border border-sky-100 px-4 py-3.5">
            <p className="text-[12px] font-bold text-slate-800">
              {catchOpen ? <Wave text={catchUp.lead} /> : catchUp.lead}
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-4">
              {catchUp.lines.map((l, i) => (
                <li key={i} className="text-[12px] text-slate-500 font-medium">
                  <b className="text-slate-900 font-bold">{l.bold}</b>{l.rest}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── What needs the client. Stated once, above the spine, because it is
             the only thing that should interrupt reading. ── */}
      {needsYou.length > 0 && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="text-base font-bold text-slate-900">Waiting on you</h2>
            <span className="text-xs text-slate-500 font-medium">
              {needsYou.length} item{needsYou.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden">
            <div className="bg-amber-50 px-4 py-2 text-[11px] font-bold text-amber-800">
              Work pauses on these until you respond
            </div>
            {needsYou.map((item, i) => (
              <div key={item.id} className={`px-4 py-3.5 flex items-center gap-3 flex-wrap ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{item.title}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{item.subtitle}</p>
                  {item.consequence && (
                    <p className="text-[11px] text-amber-700 font-semibold mt-1">{item.consequence}</p>
                  )}
                </div>
                {item.amount ? (
                  <span className="text-sm font-extrabold text-slate-900 tabular-nums">{formatINR(item.amount)}</span>
                ) : null}
                <button
                  onClick={() => onRunAction(item)}
                  className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#3D52A0] text-white hover:bg-[#334486] transition-colors cursor-pointer shrink-0"
                >
                  {item.actionLabel || 'Review'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── The spine ── */}
      <section>
        <div className="flex items-baseline gap-3 mb-1">
          <h2 className="text-base font-bold text-slate-900">Your project</h2>
          {filter === 'all' ? (
            <span className="text-xs text-slate-500 font-medium">Every stage, with what belongs to it</span>
          ) : (
            <button
              onClick={onClearFilter}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#334486] bg-sky-50 border border-sky-200 rounded-full px-2.5 py-1 hover:bg-sky-100 transition-colors cursor-pointer"
            >
              Showing one kind only — clear filter
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {/* No card around this. In the approved design the rail and its dates
            run down the page itself and only the attachments are cards — boxing
            the whole thing turned the spine into a widget sitting on the page
            rather than the page's own structure. */}
        <PortalSpine phases={phases} currentStage={lifecycle.currentStageNumber} filter={filter} />
      </section>

      {/* ── Money. Always on, because it is the question underneath the others. ── */}
      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="text-base font-bold text-slate-900">Money</h2>
          <button
            onClick={() => onOpenTab('financials')}
            className="text-xs font-bold text-[#3D52A0] hover:underline cursor-pointer"
          >
            See all payments
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-8">
            <div>
              <p className="text-[11px] text-slate-500 font-semibold">Project value</p>
              <Count to={projectValue} className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight block" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-semibold">Cleared</p>
              <Count to={totalPaid} className="text-lg sm:text-xl font-extrabold text-emerald-700 tabular-nums tracking-tight block" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[11px] text-slate-500 font-semibold">Remaining</p>
              <Count to={balanceDue} className="text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight block" />
            </div>
          </div>

          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-emerald-500 transition-all duration-[1200ms] ease-out" style={{ width: `${paidPct}%` }} />
          </div>

          <p className="text-[11px] font-medium mt-2">
            {overdueCount > 0 ? (
              <span className="text-amber-700 font-bold">
                {overdueCount} payment{overdueCount === 1 ? ' has' : 's have'} been raised — your studio will have sent you the details.
              </span>
            ) : (
              <span className="text-slate-500">Nothing is overdue. {paidPct}% of the project value is cleared.</span>
            )}
          </p>
        </div>
      </section>

      {/* --- Your studio.
             The approved mockup's footer: an eyebrow, then three columns --
             who we are, how to reach us, how we work. Reaching the studio and
             knowing the escalation path are different questions, and the old
             single stack of contact rows answered only the first.

             Milky white, the app's own ground. It was a warm beige, which read
             as a band imported from somewhere else; before that it was the same
             near-black as the hero, so the page opened and closed on two dark
             slabs. Every value comes from Studio Settings, and every block is
             omitted rather than invented when the studio has not set it. --- */}
      <section>
        <div
          /* The design system's milky white, read from the token rather than
             retyped, so the footer cannot drift away from the app's own ground
             the way it did when it was beige. */
          style={{ backgroundColor: COLOR_TOKENS.milkyWhite }}
          className="rounded-2xl border border-slate-200/80 p-6 md:p-7"
        >

          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 mb-4">
            Your studio
          </p>

          <div className="flex items-center gap-4 pb-5 mb-6 border-b border-slate-200/80">
            {studio.logoUrl ? (
              <img
                src={studio.logoUrl}
                alt={studio.name}
                className="h-14 w-auto max-w-[220px] object-contain object-left shrink-0"
              />
            ) : (
              <span className="w-14 h-14 rounded-2xl bg-white border border-slate-200 grid place-items-center text-sm font-black text-slate-700 shrink-0">
                {studio.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-slate-900 leading-tight">{studio.name}</p>
              {studio.tagline && <p className="text-[11px] text-[#334486] font-semibold mt-0.5">{studio.tagline}</p>}
            </div>
          </div>

          <div className="grid gap-7 md:grid-cols-3">

            {/* Who we are */}
            <div>
              <p className="text-[12px] text-slate-600 leading-relaxed">
                <b className="text-slate-900 font-bold">{studio.name}</b>
                {studio.about ? ` ${studio.about}` : studio.tagline ? ` — ${studio.tagline}` : ''}
              </p>
              {studio.pmName && (
                <div className="flex items-center gap-2.5 mt-4">
                  <span className="w-9 h-9 rounded-full bg-[#3D52A0] text-white grid place-items-center text-[11px] font-black shrink-0">
                    {studio.pmName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">{studio.pmName}</p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {studio.pmRole || 'Your project manager'}
                      {studio.pmResponseTime && ` · ${studio.pmResponseTime}`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* How to reach us */}
            <dl className="space-y-2.5">
              {([
                ['Studio', studio.address],
                ['Phone', studio.phone],
                ['Email', studio.email],
                ['Hours', studio.businessHours],
                ['GSTIN', studio.gstin],
              ] as [string, string | undefined][])
                .filter(([, v]) => !!v)
                .map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[74px_minmax(0,1fr)] gap-2 items-baseline">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                    <dd className={`text-[12px] text-slate-700 font-semibold break-words ${label === 'GSTIN' ? 'font-mono text-[11px]' : ''}`}>
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>

            {/* How we work */}
            <div className="space-y-4">
              {(studio.siteVisitPolicy || studio.escalationPolicy) && (
                <dl className="space-y-2.5">
                  {([
                    ['Site', studio.siteVisitPolicy],
                    ['Escalation', studio.escalationPolicy],
                  ] as [string, string | undefined][])
                    .filter(([, v]) => !!v)
                    .map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[74px_minmax(0,1fr)] gap-2 items-baseline">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                        <dd className="text-[12px] text-slate-700 font-semibold break-words">{value}</dd>
                      </div>
                    ))}
                </dl>
              )}

              {!!studio.credentials?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {studio.credentials.map(c => (
                    <span
                      key={c}
                      className="text-[10px] font-bold rounded-full px-2.5 py-1 bg-sky-50 text-[#334486] border border-sky-100"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {(studio.website || studio.instagramUrl || studio.instagramQr) && (
                <div className="flex items-start gap-3">
                  {studio.instagramQr && (
                    <img
                      src={studio.instagramQr}
                      alt={`${studio.name} on Instagram`}
                      className="w-[68px] h-[68px] rounded-xl object-contain bg-white p-1.5 border border-slate-200 shrink-0"
                    />
                  )}
                  <div className="min-w-0 space-y-1.5 pt-0.5">
                    {studio.website && (
                      <a
                        href={/^https?:\/\//.test(studio.website) ? studio.website : `https://${studio.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-bold text-[#334486] hover:underline break-all"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        {studio.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    {studio.instagramUrl && (
                      <a
                        href={/^https?:\/\//.test(studio.instagramUrl) ? studio.instagramUrl : `https://${studio.instagramUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-bold text-[#334486] hover:underline break-all"
                      >
                        <AtSign className="w-3.5 h-3.5 shrink-0" />
                        {studio.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
                      </a>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={onContactStudio}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486] transition-colors cursor-pointer"
              >
                Message your studio
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

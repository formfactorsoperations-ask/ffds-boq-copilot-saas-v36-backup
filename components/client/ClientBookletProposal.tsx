import React, { useMemo, useState } from 'react';
import { ProposalTier, ProjectContext, TimelinePhase, PaymentMilestone, FullBoqItem, ProposalLevel } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { detectAllScopes, findScopeContradictions } from '../../lib/scopeDetect';
import { groupPhasesIntoStages } from '../../lib/programmeStages';
import { CheckIcon, XIcon, ShieldCheckIcon, HelpCircleIcon, Pencil, Save } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';

/*
  An editable run of prose inside the proposal.

  The booklet ships with its wording baked into the JSX, which meant a studio
  could not correct a clause without a code change. `Ed` keeps the shipped text
  as the default and renders a studio override when one exists.

  Defined at module scope on purpose: a component declared inside the render
  body is a new type on every render, which would unmount and remount every
  editable node — losing focus mid-edit.
*/
export type EdListItem = string | { title: string; desc?: string; meta?: string };

export interface EdCtl {
    on: boolean;
    ov: Record<string, string>;
    save: (key: string, value: string) => void;
    clear: (key: string) => void;
    /** Studio-customised lists, absent until a list is restructured. Plain
        strings are clause lists; the pair shape is a title-and-blurb list. */
    lists: Record<string, EdListItem[]>;
    saveList: (key: string, items: EdListItem[]) => void;
    clearList: (key: string) => void;
}

const Ed: React.FC<{ k: string; ctl: EdCtl; children: React.ReactNode }> = ({ k, ctl, children }) => {
    const saved = ctl.ov[k];
    const shown = saved !== undefined ? saved : children;
    const ref = React.useRef<HTMLSpanElement | null>(null);

    /*
      What the booklet ships for this run.

      A plain-text child is its own default, but a paragraph carrying live
      figures — the programme length, the studio name — arrives as JSX and has
      no string to compare against. Read it off the DOM once instead, so typing
      such a paragraph back to its original wording still clears the override
      rather than pinning today's numbers into stored content.
    */
    const shipped = React.useRef<string | null>(typeof children === 'string' ? children.trim() : null);
    React.useLayoutEffect(() => {
        if (shipped.current === null && saved === undefined && ref.current) {
            shipped.current = ref.current.innerText.replace(/\u00a0/g, ' ').trim();
        }
    }, [saved]);

    if (!ctl.on) return <>{shown}</>;

    /*
      Only ever make a single text node editable.

      When the children are one string, React manages one text node and a
      contentEditable edit reconciles cleanly. A paragraph built from several
      children — text around {totalDays} and {designDays} — is different: typing
      into it destroys nodes React still expects to own, and the next render
      dies with "Failed to execute 'removeChild' on 'Node'", taking the whole
      proposal with it.

      So a mixed paragraph is rendered read-only until someone asks to edit it.
      That click captures what is on screen, live figures resolved, and from
      then on the run is one plain string and behaves like every other.
    */
    if (saved === undefined && typeof children !== 'string') {
        return (
            <span className="ff-ed-seed" ref={ref as any}>
                {children}
                <button
                    type="button"
                    className="ff-ed-seed-btn print:hidden"
                    title="Edit this paragraph"
                    onClick={() => {
                        const text = (ref.current?.innerText || '')
                            .replace(/ /g, ' ')
                            .replace(/\s*Edit\s*$/, '')
                            .trim();
                        if (text) ctl.save(k, text);
                    }}
                >Edit</button>
            </span>
        );
    }

    /*
      A seeded paragraph needs a way back.

      Seeding stores the shipped wording verbatim, so the usual
      "typed back to the default, drop the override" rule can never fire — the
      component no longer has the original children to compare against. An
      explicit control is the honest answer, and it matches how clause lists
      are restored.
    */
    const resettable = saved !== undefined && typeof children !== 'string';

    const editable = (
        <span
            ref={ref}
            className="ff-ed"
            contentEditable
            suppressContentEditableWarning
            spellCheck
            data-ff-ed={k}
            // Commit on blur only. Committing per keystroke would re-render the
            // node the caret sits in and send the cursor back to the start.
            onBlur={(e) => {
                const next = e.currentTarget.innerText.replace(/\u00a0/g, ' ').trim();
                const base = shipped.current ?? '';
                if (next === base) {
                    // Typed back to the shipped wording. Storing that as an
                    // override would pin this run to today's text and shadow any
                    // later revision of the default, so drop it instead.
                    if (saved !== undefined) ctl.clear(k);
                    return;
                }
                if (next !== saved) ctl.save(k, next);
            }}
        >{shown}</span>
    );

    if (!resettable) return editable;
    return (
        <span className="ff-ed-seed">
            {editable}
            <button
                type="button"
                className="ff-ed-seed-btn print:hidden"
                title="Discard this edit and use the standard wording"
                onClick={() => ctl.clear(k)}
            >Use standard text</button>
        </span>
    );
};

/*
  Keep only the emphasis a clause legitimately carries.

  List items are seeded from rendered HTML so that bold runs and live figures
  survive being edited. That means storing markup, so everything outside a
  small allowlist is dropped on the way in — the studio writes prose, not tags.
*/
const ALLOWED_INLINE = /^(strong|b|em|i|br|span)$/i;

const cleanInlineHtml = (html: string): string => {
  const doc = document.implementation.createHTMLDocument('');
  const holder = doc.createElement('div');
  holder.innerHTML = html;
  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      walk(child);
      if (!ALLOWED_INLINE.test(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      // Strip every attribute: class names carry the booklet's own styling and
      // event handlers have no business in stored content.
      Array.from(child.attributes).forEach((a) => child.removeAttribute(a.name));
    });
  };
  walk(holder);
  return holder.innerHTML.replace(/\s+/g, ' ').trim();
};

/*
  The programme phases, as editable cards.

  Derived from the project schedule, so the day ranges agree with the headline
  total. Editing one freezes the row of cards for this project — the studio's
  wording wins over the schedule's, which is the point on a proposal where the
  phase names are a client-facing summary rather than an ops artefact.
*/
const EdPhaseCards: React.FC<{
  k: string;
  ctl: EdCtl;
  items: { meta?: string; title: string; desc?: string }[];
}> = ({ k, ctl, items }) => {
  const savedRaw = ctl.lists[k];
  const saved = savedRaw
    ? savedRaw.map((it) => (typeof it === 'string' ? { title: it } : it))
    : undefined;
  const shown = (saved ?? items) as { meta?: string; title: string; desc?: string }[];

  const apply = (fn: (l: any[]) => any[]) => ctl.saveList(k, fn(shown.map((it) => ({ ...it }))));

  const btn =
    'px-1.5 py-0.5 text-[10px] font-bold rounded border border-slate-200 bg-white ' +
    'text-slate-500 hover:text-[#334486] hover:border-[#3D52A0]/40 transition-colors';

  const field = (value: string, onCommit: (v: string) => void, className: string) =>
    ctl.on ? (
      <span
        className={`ff-ed ${className}`}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const t = e.currentTarget.innerText.trim();
          if (t !== value) onCommit(t);
        }}
      >{value}</span>
    ) : <span className={className}>{value}</span>;

  const grid = (
    /* Written out rather than interpolated: Tailwind generates only the class
       names it can see as literals in the source, so `md:grid-cols-${n}` would
       compile to nothing and the cards would stack in a single column. */
    <div className={`grid grid-cols-1 gap-4 my-auto ${
      shown.length >= 5 ? 'md:grid-cols-5'
      : shown.length === 4 ? 'md:grid-cols-4'
      : shown.length === 3 ? 'md:grid-cols-3'
      : shown.length === 2 ? 'md:grid-cols-2'
      : 'md:grid-cols-1'
    }`}>
      {shown.map((ph, i) => (
        <div key={i} className="group/item relative p-5 border border-slate-200 bg-slate-50 rounded-xl text-center">
          <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold block mb-1">
            {field(ph.meta || '', (v) => apply((l) => { l[i].meta = v; return l; }), '')}
          </span>
          <h4 className="font-bold text-[#0F172A] text-sm mb-2">
            {field(ph.title || '', (v) => apply((l) => { l[i].title = v; return l; }), '')}
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {field(ph.desc || '', (v) => apply((l) => { l[i].desc = v; return l; }), '')}
          </p>
          {ctl.on && (
            <span className="ff-edlist-item-tools absolute top-1 right-1 opacity-0 group-hover/item:opacity-100 print:hidden">
              <button type="button" className={btn} title="Move earlier" disabled={i === 0}
                onClick={() => apply((l) => { const [x] = l.splice(i, 1); l.splice(i - 1, 0, x); return l; })}>←</button>
              <button type="button" className={btn} title="Move later" disabled={i === shown.length - 1}
                onClick={() => apply((l) => { const [x] = l.splice(i, 1); l.splice(i + 1, 0, x); return l; })}>→</button>
              <button type="button" className={btn} title="Remove phase"
                onClick={() => apply((l) => { l.splice(i, 1); return l; })}>✕</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );

  if (!ctl.on) return grid;

  return (
    <div className="ff-edlist group/list">
      {grid}
      <div className="ff-edlist-tools opacity-0 group-hover/list:opacity-100 print:hidden">
        <button type="button" className={btn}
          onClick={() => apply((l) => { l.push({ meta: 'Day —', title: 'New phase', desc: '' }); return l; })}>
          + Add phase
        </button>
        {saved && (
          <button type="button" className={btn} title="Go back to the phases from the project schedule"
            onClick={() => ctl.clearList(k)}>
            Use project schedule
          </button>
        )}
      </div>
    </div>
  );
};

/*
  A title-and-blurb list the studio can restructure.

  The "What is included" columns are built from the BOQ as {title, desc} pairs,
  so unlike the annexure clauses there is nothing to seed from the DOM — the
  defaults are already structured data. Editing one freezes that column for this
  project, which is the point: the derived version is a starting draft, and the
  studio has the last word on what the client is told is in or out of scope.
*/
const EdPairList: React.FC<{
  k: string;
  ctl: EdCtl;
  items: { title: string; desc?: string }[];
  variant: 'include' | 'exclude';
}> = ({ k, ctl, items, variant }) => {
  const savedRaw = ctl.lists[k];
  const saved = savedRaw
    ? savedRaw.map((it) => (typeof it === 'string' ? { title: it } : it))
    : undefined;
  const shown = saved ?? items;

  const apply = (fn: (list: { title: string; desc?: string }[]) => { title: string; desc?: string }[]) =>
    ctl.saveList(k, fn(shown.map((it) => ({ ...it }))));

  const isInclude = variant === 'include';
  const btn =
    'px-1.5 py-0.5 text-[10px] font-bold rounded border border-slate-200 bg-white ' +
    'text-slate-500 hover:text-[#334486] hover:border-[#3D52A0]/40 transition-colors';

  const row = (it: { title: string; desc?: string }, i: number) => (
    <li key={i} className={`group/item flex items-start gap-3 ${isInclude ? 'text-slate-700' : 'text-slate-500'}`}>
      {isInclude
        ? <CheckIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        : <XIcon className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />}
      <div className="flex-1">
        {isInclude ? (
          <strong className="text-slate-900 block font-medium">
            {ctl.on ? (
              <span className="ff-ed" contentEditable suppressContentEditableWarning
                onBlur={(e) => {
                  const t = e.currentTarget.innerText.trim();
                  if (t !== it.title) apply((l) => { l[i].title = t; return l; });
                }}>{it.title}</span>
            ) : it.title}
          </strong>
        ) : (
          <span className="text-slate-400 block line-through">
            {ctl.on ? (
              <span className="ff-ed" contentEditable suppressContentEditableWarning
                onBlur={(e) => {
                  const t = e.currentTarget.innerText.trim();
                  if (t !== it.title) apply((l) => { l[i].title = t; return l; });
                }}>{it.title}</span>
            ) : it.title}
          </span>
        )}
        <span className={`text-xs block ${isInclude ? 'text-slate-500' : 'text-slate-400'}`}>
          {ctl.on ? (
            <span className="ff-ed" contentEditable suppressContentEditableWarning
              onBlur={(e) => {
                const d = e.currentTarget.innerText.trim();
                if (d !== (it.desc || '')) apply((l) => { l[i].desc = d; return l; });
              }}>{it.desc || ''}</span>
          ) : it.desc}
        </span>
      </div>
      {ctl.on && (
        <span className="ff-edlist-item-tools opacity-0 group-hover/item:opacity-100 print:hidden">
          <button type="button" className={btn} title="Move up" disabled={i === 0}
            onClick={() => apply((l) => { const [x] = l.splice(i, 1); l.splice(i - 1, 0, x); return l; })}>↑</button>
          <button type="button" className={btn} title="Move down" disabled={i === shown.length - 1}
            onClick={() => apply((l) => { const [x] = l.splice(i, 1); l.splice(i + 1, 0, x); return l; })}>↓</button>
          <button type="button" className={btn} title="Remove"
            onClick={() => apply((l) => { l.splice(i, 1); return l; })}>✕</button>
        </span>
      )}
    </li>
  );

  if (!ctl.on) return <ul className="space-y-4">{shown.map(row)}</ul>;

  return (
    <div className="ff-edlist group/list">
      <ul className="space-y-4">{shown.map(row)}</ul>
      <div className="ff-edlist-tools opacity-0 group-hover/list:opacity-100 print:hidden">
        <button type="button" className={btn}
          onClick={() => apply((l) => { l.push({ title: 'New item', desc: '' }); return l; })}>
          + Add item
        </button>
        {saved && (
          <button type="button" className={btn} title="Go back to the list derived from the BOQ"
            onClick={() => ctl.clearList(k)}>
            Use derived list
          </button>
        )}
      </div>
    </div>
  );
};

/*
  A clause list the studio can restructure.

  Text editing already works through <Ed> on each item, so this deliberately
  does nothing until someone needs to add, remove or reorder a clause. Until
  then the booklet's own markup renders untouched — which keeps live figures
  such as the programme length and the design fee live. The first structural
  edit seeds a copy from what is on screen, and from then on the studio's list
  is the one that prints. "Use standard list" puts it back.
*/
const EdList: React.FC<{
  k: string;
  ctl: EdCtl;
  as?: 'ul' | 'ol';
  className?: string;
  children: React.ReactNode;
}> = ({ k, ctl, as = 'ul', className = '', children }) => {
  const Tag = as as any;
  /* The store holds both clause lists and title/blurb lists; this component
     only speaks the string form, so coerce rather than assume. */
  const savedRaw = ctl.lists[k];
  const saved = savedRaw
    ? savedRaw.map((it) => (typeof it === 'string' ? it : it.title))
    : undefined;
  const ref = React.useRef<HTMLElement | null>(null);

  // Read what the booklet currently renders, so a seeded list is identical to
  // the one it replaces.
  const seedFromDom = (): string[] => {
    const el = ref.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll(':scope > li')).map((li) =>
      cleanInlineHtml((li as HTMLElement).innerHTML),
    );
  };

  const apply = (fn: (items: string[]) => string[]) => {
    const base = saved ?? seedFromDom();
    ctl.saveList(k, fn([...base]));
  };

  if (!ctl.on) {
    return saved ? (
      <Tag className={className}>
        {saved.map((html, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: html }} />
        ))}
      </Tag>
    ) : (
      <Tag className={className}>{children}</Tag>
    );
  }

  const btn =
    'px-1.5 py-0.5 text-[10px] font-bold rounded border border-slate-200 bg-white ' +
    'text-slate-500 hover:text-[#334486] hover:border-[#3D52A0]/40 transition-colors';

  return (
    <div className="ff-edlist group/list relative">
      {saved ? (
        <Tag className={className}>
          {saved.map((html, i) => (
            <li key={i} className="group/item relative">
              <span
                className="ff-ed"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const next = cleanInlineHtml(e.currentTarget.innerHTML);
                  if (next !== html) apply((items) => { items[i] = next; return items; });
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
              <span className="ff-edlist-item-tools opacity-0 group-hover/item:opacity-100 print:hidden">
                <button type="button" className={btn} title="Move up" disabled={i === 0}
                  onClick={() => apply((items) => { const [x] = items.splice(i, 1); items.splice(i - 1, 0, x); return items; })}>↑</button>
                <button type="button" className={btn} title="Move down" disabled={i === saved.length - 1}
                  onClick={() => apply((items) => { const [x] = items.splice(i, 1); items.splice(i + 1, 0, x); return items; })}>↓</button>
                <button type="button" className={btn} title="Remove clause"
                  onClick={() => apply((items) => { items.splice(i, 1); return items; })}>✕</button>
              </span>
            </li>
          ))}
        </Tag>
      ) : (
        <Tag ref={ref} className={className}>{children}</Tag>
      )}

      <div className="ff-edlist-tools opacity-0 group-hover/list:opacity-100 print:hidden">
        <button type="button" className={btn}
          onClick={() => apply((items) => { items.push('New clause'); return items; })}>
          + Add clause
        </button>
        {saved && (
          <button type="button" className={btn} title="Discard the studio's version of this list"
            onClick={() => ctl.clearList(k)}>
            Use standard list
          </button>
        )}
      </div>
    </div>
  );
};

interface ClientBookletProposalProps {
    tiers: ProposalTier[];
    projectContext: ProjectContext;
    timelinePhases: TimelinePhase[];
    paymentMilestones: PaymentMilestone[];
    level: ProposalLevel;
    settings: any;
    paymentStructure?: any;
    onEditSection?: (sectionId: string) => void;
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
    isClientViewOnly?: boolean;
}

export const ClientBookletProposal: React.FC<ClientBookletProposalProps> = ({
    tiers = [],
    projectContext,
    timelinePhases = [],
    paymentMilestones = [],
    level,
    settings,
    paymentStructure,
    onEditSection,
    setProjectContext,
    isClientViewOnly = false
}) => {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const { currentRole } = useOrg();
    const isDesigner = currentRole === 'Designer';
    const showScopePricing = projectContext?.showScopePricing || false;
    
    // Determine the latest Terms Docket from the project context
    const latestDocket = useMemo(() => {
        const dockets = projectContext?.termsDockets || [];
        if (dockets.length === 0) return undefined;
        return dockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt) ? prev : curr);
    }, [projectContext?.termsDockets]);
    
    // --- STATE FOR EDITING SPECIFICATIONS ---
    const [isEditingSpecs, setIsEditingSpecs] = useState(false);
    const [editedValues, setEditedValues] = useState<Record<string, string>>({});
    
    // Determine the active tier based on approved tier or first tier
    const isL2 = level === 'LEVEL_2';
    const isL15 = level === 'LEVEL_1_5';
    const approvedTier = useMemo(() => {
        return tiers.find(t => t.id === projectContext.approvedTierId) || tiers[0] || {
            name: "Standard Package",
            summary: { totalSell: 0, designFee: 0 },
            fullBoq: [],
            groupedBoq: {}
        };
    }, [tiers, projectContext.approvedTierId]);

    const activeTier = isL2 ? approvedTier : (tiers[0] || {
        name: "Standard Package",
        summary: { totalSell: 0, designFee: 0 },
        fullBoq: [],
        groupedBoq: {}
    });

    // --- ESTIMATED DURATION & TIMELINE ---
    const totalDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) {
            const config = (projectContext?.config || '').toLowerCase();
            if (config.includes('1-bhk') || config.includes('studio')) return 45;
            if (config.includes('2-bhk')) return 60;
            if (config.includes('3-bhk')) return 75;
            if (config.includes('4-bhk') || config.includes('duplex')) return 90;
            if (config.includes('bath')) return 25;
            return 48; // Standard booklet design says 48 working days
        }
        return Math.max(...timelinePhases.map(p => (p.startDay || 0) + p.durationDays));
    }, [timelinePhases, projectContext]);

    const designDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) return 14;
        const designPhase = timelinePhases.find(p => p.phaseName === 'Design & Planning');
        return designPhase ? designPhase.durationDays : 14;
    }, [timelinePhases]);

    /*
      The programme, at the level a first cut should state it.

      The schedule is a CPM plan of ten overlapping site trades. Showing it
      verbatim gave the client exact day ranges on a proposal that has not been
      through design freeze, and the ranges overlapped, which reads as
      confusion rather than a plan. It is grouped into a few named stages
      instead — and design, which the schedule does not contain at all, is put
      back at the front where it belongs.
    */
    const derivedPhases = useMemo(
        () => groupPhasesIntoStages((timelinePhases || []) as any[], designDays),
        [timelinePhases, designDays],
    );

    const executionDays = useMemo(() => {
        return totalDays - designDays > 0 ? totalDays - designDays : 34;
    }, [totalDays, designDays]);

    // --- FINANCIAL CALCULATIONS ---
    const financials = projectContext?.financials;
    const discounts = financials?.discounts || [];
    const gstRate = projectContext?.gstRate || 18;
    const isExecutionGstWaived = financials?.executionGstEnabled === false;

    const baseExecution = isL2 ? (approvedTier.summary?.totalSell || 0) : (activeTier.summary?.totalSell || 0);
    const baseDesign = isL2 ? (approvedTier.summary?.designFee || 0) : (activeTier.summary?.designFee || 0);

    const executionSavings = discounts
        .filter(d => d.target === 'execution')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseExecution * (d.value / 100) : d.value), 0);
    const designSavings = discounts
        .filter(d => d.target === 'design')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseDesign * (d.value / 100) : d.value), 0);

    const taxableExecution = Math.max(0, baseExecution - executionSavings);
    const taxableDesign = Math.max(0, baseDesign - designSavings);

    /*
      How the design fee was actually arrived at.

      This read "Fixed fee" unconditionally, so a percentage-of-cost or
      per-sqft engagement was described to the client as fixed — the amount was
      right, the basis line beside it was not. The client signs against this
      table, so the basis has to match what the fee engine was set to.
    */
    const designFeeBasis = (() => {
        const t = projectContext?.designFeeType;
        const v = projectContext?.designFee;
        if (t === 'percentage' || !t) return `${v || 0}% of execution cost`;
        if (t === 'fixed_sqft') return `₹${(v || 0).toLocaleString('en-IN')} per sq ft`;
        return 'Fixed fee';
    })();

    /*
      Prose overrides. Stored per proposal mode alongside the material
      overrides that already worked this way, so Turnkey and Design-only
      booklets can word the same clause differently.
    */
    const blockOverrides: Record<string, string> = (
        (projectContext as any)?.proposalContentByMode?.[(projectContext as any)?.activeProposalMode || 'TURNKEY']?.blocks
        || projectContext?.proposalContent?.blocks
        || {}
    );

    const saveBlock = React.useCallback((key: string, value: string) => {
        if (!setProjectContext) return;
        setProjectContext((prev: any) => {
            const activeMode = prev.activeProposalMode || 'TURNKEY';
            const modeContent = prev.proposalContentByMode?.[activeMode] || prev.proposalContent || {};
            const blocks = { ...(modeContent.blocks || {}) };
            blocks[key] = value;
            const updatedModeContent = { ...modeContent, blocks };
            return {
                ...prev,
                proposalContentByMode: {
                    ...(prev.proposalContentByMode || {}),
                    [activeMode]: updatedModeContent
                },
                ...(activeMode === 'TURNKEY' ? { proposalContent: updatedModeContent } : {})
            };
        });
    }, [setProjectContext]);

    const clearBlock = React.useCallback((key: string) => {
        if (!setProjectContext) return;
        setProjectContext((prev: any) => {
            const activeMode = prev.activeProposalMode || 'TURNKEY';
            const modeContent = prev.proposalContentByMode?.[activeMode] || prev.proposalContent || {};
            if (!modeContent.blocks || modeContent.blocks[key] === undefined) return prev;
            const blocks = { ...modeContent.blocks };
            delete blocks[key];
            const updatedModeContent = { ...modeContent, blocks };
            return {
                ...prev,
                proposalContentByMode: {
                    ...(prev.proposalContentByMode || {}),
                    [activeMode]: updatedModeContent
                },
                ...(activeMode === 'TURNKEY' ? { proposalContent: updatedModeContent } : {})
            };
        });
    }, [setProjectContext]);

    const listOverrides: Record<string, string[]> = (
        (projectContext as any)?.proposalContentByMode?.[(projectContext as any)?.activeProposalMode || 'TURNKEY']?.lists
        || (projectContext as any)?.proposalContent?.lists
        || {}
    );

    const writeContent = React.useCallback((mutate: (content: any) => any) => {
        if (!setProjectContext) return;
        setProjectContext((prev: any) => {
            const activeMode = prev.activeProposalMode || 'TURNKEY';
            const modeContent = prev.proposalContentByMode?.[activeMode] || prev.proposalContent || {};
            const updated = mutate(modeContent);
            if (updated === modeContent) return prev;
            return {
                ...prev,
                proposalContentByMode: {
                    ...(prev.proposalContentByMode || {}),
                    [activeMode]: updated
                },
                ...(activeMode === 'TURNKEY' ? { proposalContent: updated } : {})
            };
        });
    }, [setProjectContext]);

    const saveList = React.useCallback((key: string, items: string[]) => {
        writeContent((content) => ({ ...content, lists: { ...(content.lists || {}), [key]: items } }));
    }, [writeContent]);

    const clearList = React.useCallback((key: string) => {
        writeContent((content) => {
            if (!content.lists || content.lists[key] === undefined) return content;
            const lists = { ...content.lists };
            delete lists[key];
            return { ...content, lists };
        });
    }, [writeContent]);

    /* Editable for the studio, never for the client, and never in a print or
       PDF pass — a caret outline has no business on a document a client signs. */
    const edCtl: EdCtl = React.useMemo(() => ({
        on: !!setProjectContext && !isClientViewOnly,
        ov: blockOverrides,
        save: saveBlock,
        clear: clearBlock,
        lists: listOverrides,
        saveList,
        clearList,
    }), [setProjectContext, isClientViewOnly, blockOverrides, saveBlock, clearBlock, listOverrides, saveList, clearList]);

    /*
      Page numbers, counted rather than typed.

      Nine footers carried a hardcoded "Page N of 15" while the booklet
      actually rendered sixteen frames. The running numbers were right — they
      skip (2, 3, 7, 8, 9, 11 …) because covers and dividers carry no footer,
      which is deliberate — but the total was stale, and every one of them was
      a literal. Sections render conditionally, so any number written by hand
      is wrong on some project even when it is right on this one.

      The running number comes from a CSS counter on .ff-page, which costs
      nothing and follows document order through every conditional. Only the
      total needs measuring, and it is one number read back after layout.
    */
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const [pageTotal, setPageTotal] = React.useState(0);
    React.useLayoutEffect(() => {
        const n = wrapperRef.current?.querySelectorAll('.ff-page').length || 0;
        setPageTotal((prev) => (prev === n ? prev : n));
    });

    const gstOnDesign = taxableDesign * (gstRate / 100);
    const chargedGstOnExecution = isExecutionGstWaived ? 0 : (taxableExecution * (gstRate / 100));

    const finalDesignTotal = taxableDesign + gstOnDesign;
    const finalExecutionTotal = taxableExecution + chargedGstOnExecution;
    const netTaxableValue = taxableExecution + taxableDesign;
    const totalProposedInvestment = finalDesignTotal + finalExecutionTotal;

    // Calculate all-inclusive total investment for each tier for accurate min/max ranges
    const tierInvestments = useMemo(() => {
        if (!tiers || tiers.length === 0) return [totalProposedInvestment];
        return tiers.map(t => {
            const baseExec = t.summary?.totalSell || 0;
            const baseDes = t.summary?.designFee || 0;
            
            const execSavings = discounts
                .filter(d => d.target === 'execution')
                .reduce((sum, d) => sum + (d.type === 'percentage' ? baseExec * (d.value / 100) : d.value), 0);
            const desSavings = discounts
                .filter(d => d.target === 'design')
                .reduce((sum, d) => sum + (d.type === 'percentage' ? baseDes * (d.value / 100) : d.value), 0);
                
            const taxExec = Math.max(0, baseExec - execSavings);
            const taxDes = Math.max(0, baseDes - desSavings);
            
            const gstDes = taxDes * (gstRate / 100);
            const gstExec = isExecutionGstWaived ? 0 : (taxExec * (gstRate / 100));
            
            return taxExec + taxDes + gstDes + gstExec;
        });
    }, [tiers, discounts, gstRate, isExecutionGstWaived, totalProposedInvestment]);

    const investmentMin = useMemo(() => {
        if (tierInvestments.length === 0) return totalProposedInvestment;
        return Math.min(...tierInvestments);
    }, [tierInvestments, totalProposedInvestment]);

    const investmentMax = useMemo(() => {
        if (tierInvestments.length === 0) return totalProposedInvestment;
        return Math.max(...tierInvestments);
    }, [tierInvestments, totalProposedInvestment]);

    // --- GROUP BOQ ITEMS ---
    const carpentryItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('carpentry') || cat.includes('wood') || cat.includes('furniture') || name.includes('wardrobe') || name.includes('loft') || name.includes('cabinet') || name.includes('panelling') || name.includes('tv unit');
        });
    }, [activeTier]);

    const otherItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return !cat.includes('carpentry') && !cat.includes('wood') && !cat.includes('furniture') && !name.includes('wardrobe') && !name.includes('loft') && !name.includes('cabinet') && !name.includes('panelling') && !name.includes('tv unit');
        });
    }, [activeTier]);

    // --- DYNAMIC QUANTUMS FROM BOQ ---
    const civilItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('civil') || cat.includes('masonry') || cat.includes('tile') || cat.includes('plumbing') || cat.includes('demolition') || name.includes('civil') || name.includes('tile') || name.includes('plumbing') || name.includes('demolition');
        });
    }, [activeTier]);

    const ceilingItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('ceiling') || cat.includes('gypsum') || name.includes('ceiling') || name.includes('gypsum');
        });
    }, [activeTier]);

    const paintItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('paint') || cat.includes('finishing') || cat.includes('polish') || name.includes('paint') || name.includes('polish') || name.includes('putty');
        });
    }, [activeTier]);

    const electricalItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('electrical') || cat.includes('service') || cat.includes('light') || cat.includes('wiring') || name.includes('electrical') || name.includes('point') || name.includes('switch') || name.includes('wiring');
        });
    }, [activeTier]);

    const carpentryQuantum = useMemo(() => {
        if (carpentryItems.length === 0) return '0 sq ft';
        const sqftSum = carpentryItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('sq') || u.includes('sft');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);
        const rftSum = carpentryItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('rft') || u.includes('run');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);
        const nosSum = carpentryItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('no') || u.includes('pc') || u.includes('unit');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);

        const parts = [];
        if (sqftSum > 0) parts.push(`${sqftSum.toFixed(0)} sq ft`);
        if (rftSum > 0) parts.push(`${rftSum.toFixed(0)} Rft`);
        if (nosSum > 0) parts.push(`${nosSum.toFixed(0)} nos`);
        return parts.join(', ') || `${carpentryItems.reduce((sum, i) => sum + (i.qty || 0), 0).toFixed(0)} items`;
    }, [carpentryItems]);

    const ceilingQuantum = useMemo(() => {
        const sum = ceilingItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        return sum > 0 ? `${sum.toFixed(0)} sq ft` : null;
    }, [ceilingItems]);

    const paintQuantum = useMemo(() => {
        const sum = paintItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        return sum > 0 ? `${sum.toFixed(0)} sq ft` : null;
    }, [paintItems]);

    const ceilingAndPaintQuantum = useMemo(() => {
        const parts = [];
        if (ceilingQuantum) parts.push(`${ceilingQuantum} Ceiling`);
        if (paintQuantum) parts.push(`${paintQuantum} Paint`);
        return parts.join(' + ') || 'As per design';
    }, [ceilingQuantum, paintQuantum]);

    const electricalQuantum = useMemo(() => {
        if (electricalItems.length === 0) return '0 points';
        const pointsSum = electricalItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('point') || u.includes('no') || u.includes('pc') || u.includes('unit');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);
        const otherSum = electricalItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return !u.includes('point') && !u.includes('no') && !u.includes('pc') && !u.includes('unit');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);

        if (pointsSum > 0) {
            return `${pointsSum.toFixed(0)} points`;
        }
        if (otherSum > 0) {
            return `${otherSum.toFixed(0)} items`;
        }
        return `${electricalItems.reduce((sum, i) => sum + (i.qty || 0), 0).toFixed(0)} items`;
    }, [electricalItems]);

    const hasKitchenInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('kitchen') || name.includes('kitchen');
        });
    }, [activeTier]);

    const hasWardrobeInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('wardrobe') || name.includes('wardrobe') || name.includes('loft');
        });
    }, [activeTier]);

    const hasLooseFurnitureInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('sofa') || name.includes('dining table') || name.includes('mattress') || name.includes('chair') || name.includes('recliner');
        });
    }, [activeTier]);

    const hasElectricalFixturesInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('fixture') || name.includes('chandelier') || name.includes('pendant') || name.includes('led strip') || name.includes('appliance');
        });
    }, [activeTier]);

    const dynamicInclusions = useMemo(() => {
        const list = [];
        if (carpentryItems.length > 0) {
            list.push({
                title: 'Custom Carpentry Works',
                desc: carpentryItems.slice(0, 3).map(i => i.name).join(', ') + (carpentryItems.length > 3 ? ' and more.' : '.')
            });
        }
        if (ceilingItems.length > 0) {
            list.push({
                title: 'POP False Ceiling',
                desc: ceilingItems.slice(0, 2).map(i => i.name).join(', ') + (ceilingItems.length > 2 ? ' and more.' : '.')
            });
        }
        if (paintItems.length > 0) {
            list.push({
                title: 'Premium Painting & Finishing',
                desc: paintItems.slice(0, 2).map(i => i.name).join(', ') + (paintItems.length > 2 ? ' and more.' : '.')
            });
        }
        if (electricalItems.length > 0) {
            list.push({
                title: 'Electrical Work & Services',
                desc: electricalItems.slice(0, 3).map(i => i.name).join(', ') + (electricalItems.length > 3 ? ' and more.' : '.')
            });
        }
        if (civilItems.length > 0) {
            list.push({
                title: 'Civil & Masonry Works',
                desc: civilItems.slice(0, 3).map(i => i.name).join(', ') + (civilItems.length > 3 ? ' and more.' : '.')
            });
        }
        if (list.length === 0) {
            list.push({
                title: 'Interior Design & Turnkey Scope',
                desc: 'A complete custom interior package tailored for your residence, as listed in the detailed BOQ pages.'
            });
        }
        return list;
    }, [carpentryItems, ceilingItems, paintItems, electricalItems, civilItems]);

    const dynamicExclusions = useMemo(() => {
        const list = [];
        if (!hasKitchenInBoq) {
            list.push({
                title: 'Modular Kitchen base & wall cabinetry',
                desc: 'Can be quoted separately as an addendum based on finalized appliance selection.'
            });
        }
        if (!hasWardrobeInBoq) {
            list.push({
                title: 'Wardrobes, Lofts & Bedroom Carpentry',
                desc: 'Can be added as per layouts and priced based on required sheets.'
            });
        }
        if (!hasElectricalFixturesInBoq) {
            list.push({
                title: 'Electrical fixtures and fitting materials',
                desc: 'Charged separately as actuals against vendor bills or direct client purchase.'
            });
        }
        if (!hasLooseFurnitureInBoq) {
            list.push({
                title: 'Loose Furniture, Accessories & Decor',
                desc: 'Sofas, dining tables, mattresses, and decorative wall arts are excluded.'
            });
        }
        if (list.length === 0) {
            list.push({
                title: 'Structural alterations & external works',
                desc: 'Major core cutting, external waterproofing, and society exterior changes.'
            });
        }
        return list;
    }, [hasKitchenInBoq, hasWardrobeInBoq, hasElectricalFixturesInBoq, hasLooseFurnitureInBoq]);

    const dynamicBulletPoints = useMemo(() => {
        const bullets = [];
        bullets.push('✓ Professional, turnkey management from site setup to handover');
        
        if (carpentryItems.length > 0) {
            const sampleCarp = carpentryItems.slice(0, 2).map(i => i.name).join(', ');
            bullets.push(`✓ Custom carpentry: including ${sampleCarp}`);
        }
        if (ceilingItems.length > 0) {
            bullets.push('✓ Premium gypsum false ceilings with planned electrical cut-outs');
        }
        if (paintItems.length > 0) {
            bullets.push('✓ Complete interior painting and finishing using premium paint materials');
        }
        if (electricalItems.length > 0) {
            bullets.push('✓ Systematic electrical wiring, switches, and service point coordination');
        }
        if (civilItems.length > 0) {
            bullets.push('✓ Custom civil/masonry works, structural tweaks, and surface tiling as per layouts');
        }
        
        while (bullets.length < 4) {
            bullets.push('✓ Strict supervision and daily quality check reports');
        }
        return bullets.slice(0, 4);
    }, [carpentryItems, ceilingItems, paintItems, electricalItems, civilItems]);

    const dynamicSpecExclusions = useMemo(() => {
        const specs = [];
        if (!hasKitchenInBoq) {
            specs.push('✕ Kitchen shutters & base carcass');
        }
        if (!hasWardrobeInBoq) {
            specs.push('✕ Wardrobe carcass, shutters & lofts');
        }
        
        const hasCounterStone = activeTier.fullBoq?.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('stone') || name.includes('quartz') || name.includes('countertop');
        });
        if (!hasCounterStone) {
            specs.push('✕ Premium countertop quartz or granite');
        }
        
        specs.push('✕ White goods and kitchen appliances');
        specs.push('✕ Decorative wallpaper and customized art');
        
        return specs.slice(0, 4);
    }, [hasKitchenInBoq, hasWardrobeInBoq, activeTier]);

    // --- DYNAMIC SPECIFICATIONS FROM BOQ OR OVERRIDES ---
    const dynamicSpecs = useMemo(() => {
        const items = activeTier.fullBoq || [];
        const overrides = projectContext?.proposalContent?.materials?.overrides || {};

        const specsConfig = [
            {
                category: 'Plywood',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('carpentry') || (i.cat || '').toLowerCase().includes('wood') || (i.cat || '').toLowerCase().includes('kitchen'),
                keywords: ['BWP', 'BWR', 'Marine', 'MR Grade', 'Commercial', '710', '303', 'Century', 'Greenply', 'Kitply'],
                defaultMat: 'Commercial / MR Grade Plywood (BWP for wet areas)'
            },
            {
                category: 'Hardware System',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('hardware') || (i.specs || '').toLowerCase().includes('hinge') || (i.specs || '').toLowerCase().includes('channel') || (i.name || '').toLowerCase().includes('drawer'),
                keywords: ['Soft-close', 'Hettich', 'Ebco', 'Godrej', 'Hinges', 'Channels', 'Blum', 'Hafele'],
                defaultMat: 'SS soft-close hinges & telescopic channels'
            },
            {
                category: 'Laminate — Inner',
                matcher: (i: FullBoqItem) => (i.specs || '').toLowerCase().includes('laminate') && ((i.specs || '').toLowerCase().includes('inner') || (i.specs || '').toLowerCase().includes('liner') || (i.name || '').toLowerCase().includes('inner')),
                keywords: ['0.8mm', 'white liner', 'balancing', 'liner'],
                defaultMat: '0.8mm balancing white liner laminate'
            },
            {
                category: 'Laminate — Outer',
                matcher: (i: FullBoqItem) => (i.specs || '').toLowerCase().includes('laminate') && !((i.specs || '').toLowerCase().includes('inner') || (i.specs || '').toLowerCase().includes('liner') || (i.name || '').toLowerCase().includes('inner')),
                keywords: ['Merino', 'Greenlam', 'Royal Touche', 'Century', '1mm', '1.25mm', 'Acrylic', 'PU', 'Suede', 'Gloss', 'Matt'],
                defaultMat: '1.0mm premium suede/gloss finish laminate'
            },
            {
                category: 'Paint Finish',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('paint') || (i.cat || '').toLowerCase().includes('finishing') || (i.cat || '').toLowerCase().includes('polish'),
                keywords: ['Royale', 'Apcolite', 'Asian Paints', 'Dulux', 'Velvet', 'Matt', 'Royale Matt'],
                defaultMat: 'Premium emulsion paint (Asian Paints Royale / equivalent)'
            },
            {
                category: 'False Ceiling',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('ceiling') || (i.cat || '').toLowerCase().includes('gypsum') || (i.name || '').toLowerCase().includes('ceiling') || (i.name || '').toLowerCase().includes('pop'),
                keywords: ['Gypsum', 'Saint Gobain', 'POP', 'Grid'],
                defaultMat: 'Gypsum board ceiling with metal framework & POP finish'
            },
            {
                category: 'Electrical',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('electrical') || (i.cat || '').toLowerCase().includes('service') || (i.cat || '').toLowerCase().includes('wiring'),
                keywords: ['Polycab', 'Finolex', 'Anchor', 'Legrand', 'GM', 'Schneider', 'Norisys', 'Havells'],
                defaultMat: 'FRLS copper wiring (Polycab/Finolex) with modular switches (GM/Anchor)'
            }
        ];

        return specsConfig.map(config => {
            let overriddenValue = '';
            
            const normKey = config.category.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const key of Object.keys(overrides)) {
                const normOverrideKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normOverrideKey.includes(normKey) || normKey.includes(normOverrideKey)) {
                    const overrideObj = overrides[key];
                    if (overrideObj) {
                        overriddenValue = overrideObj['material'] || overrideObj[activeTier.name] || overrideObj['Specified Standard'] || '';
                        break;
                    }
                }
            }

            if (overriddenValue) {
                return {
                    category: config.category,
                    value: overriddenValue
                };
            }

            const relevantItems = items.filter(config.matcher);
            const foundKeywords = new Set<string>();
            relevantItems.forEach(i => {
                const text = `${i.name} ${i.specs || ''}`;
                config.keywords.forEach(k => {
                    if (text.toLowerCase().includes(k.toLowerCase())) {
                        foundKeywords.add(k);
                    }
                });
            });

            const value = foundKeywords.size > 0 
                ? Array.from(foundKeywords).join(', ') 
                : config.defaultMat;

            return {
                category: config.category,
                value: value
            };
        });
    }, [activeTier, projectContext]);

    const startEditingSpecs = () => {
        const initialValues: Record<string, string> = {};
        dynamicSpecs.forEach(spec => {
            initialValues[spec.category] = spec.value;
        });
        setEditedValues(initialValues);
        setIsEditingSpecs(true);
    };

    const saveSpecs = () => {
        if (!setProjectContext) return;
        setProjectContext((prev: any) => {
            const activeMode = prev.activeProposalMode || 'TURNKEY';
            const modeContent = prev.proposalContentByMode?.[activeMode] || prev.proposalContent || {};
            const materials = modeContent.materials || {};
            const overs = materials.overrides ? { ...materials.overrides } : {};

            Object.entries(editedValues).forEach(([category, val]) => {
                if (!overs[category]) overs[category] = {};
                overs[category]['material'] = val;
                overs[category]['Specified Standard'] = val;
                overs[category][activeTier.name] = val;
            });

            const updatedModeContent = {
                ...modeContent,
                materials: { ...materials, overrides: overs }
            };

            const newProposalContentByMode = {
                ...(prev.proposalContentByMode || {}),
                [activeMode]: updatedModeContent
            };

            const mainUpdate = activeMode === 'TURNKEY'
                ? { proposalContent: updatedModeContent }
                : {};

            return {
                ...prev,
                proposalContentByMode: newProposalContentByMode,
                ...mainUpdate
            };
        });
        setIsEditingSpecs(false);
    };

    /*
      What the proposal is allowed to tell the client is included.

      These twelve answers used to be twelve inline substring tests over item
      names. That produced statements in a signed document that the BOQ
      contradicted — 'tall' matched "ins(tall)ation of sanitary ware", 'counter'
      matched a bathroom washbasin and a *demolition* of the kitchen counter,
      'wall' matched "kitchen - plastering wall". The rules now live in
      lib/scopeDetect.ts, are whole-word, area-scoped, blind to removals, and
      unit-tested against this project's real item names.
    */
    const scopes = useMemo(
      () => detectAllScopes((activeTier.fullBoq || []) as any[]),
      [activeTier],
    );

    /*
      A last look before the document goes out.

      The include and exclude lists come from the same rules, so they cannot
      disagree with each other — but if a rule is wrong they are wrong
      together, and the result is a booklet that prices something on one page
      and excludes it on another. This asks the looser question the strict
      rules refuse to answer, and only ever tells the studio.
    */
    const scopeContradictions = useMemo(
      () => findScopeContradictions((activeTier.fullBoq || []) as any[], scopes),
      [activeTier, scopes],
    );

    const hasKitchenBaseWall = scopes.kitchenBaseWall;
    const hasKitchenShutters = scopes.kitchenShutters;
    const hasCountertop = scopes.kitchenCounter;
    const hasTallUnit = scopes.kitchenTallUnit;
    const hasKitchenAccessories = scopes.kitchenAccessories;
    const hasKitchenLoft = scopes.kitchenLoft;
    const hasWardrobes = scopes.wardrobes;
    const hasLofts = scopes.lofts;
    const hasBeds = scopes.beds;
    const hasStudy = scopes.study;
    const hasVanity = scopes.vanity;
    const hasMirrorUnit = scopes.mirrorUnit;
    const hasBathroomStorage = scopes.bathroomStorage;

    const hasAnyCarpentryIncluded = useMemo(() => {
        return hasKitchenBaseWall || hasKitchenShutters || hasCountertop || hasTallUnit || hasKitchenAccessories ||
               hasWardrobes || hasLofts || hasBeds || hasStudy ||
               hasVanity || hasMirrorUnit || hasBathroomStorage;
    }, [
        hasKitchenBaseWall, hasKitchenShutters, hasCountertop, hasTallUnit, hasKitchenAccessories,
        hasWardrobes, hasLofts, hasBeds, hasStudy,
        hasVanity, hasMirrorUnit, hasBathroomStorage
    ]);

    const hasElectricalFittings = scopes.electricalFittings;

    const hasLooseFurniture = scopes.looseFurniture;

    const hasWhiteGoods = scopes.whiteGoods;

    const hasDecor = scopes.decor;

    const hasPlumbing = scopes.plumbing;

    const hasWaterproofing = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return cat.includes('waterproof') || name.includes('waterproof');
        });
    }, [activeTier]);

    const hasFlooring = scopes.flooring;

    const hasProfileCove = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('profile') || name.includes('cove') || name.includes('strip') || name.includes('led');
        });
    }, [activeTier]);

    const hasVeneerFluted = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('veneer') || name.includes('fluted') || name.includes('charcoal') || name.includes('louver') || name.includes('louvers') || name.includes('upgraded panel');
        });
    }, [activeTier]);

    const hasDbUpgrades = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('distribution board') || name.includes('db upgrade') || name.includes('earthing') || name.includes('switchgear');
        });
    }, [activeTier]);

    const kitchenExclusionText = useMemo(() => {
        const missing = [];
        if (!hasKitchenBaseWall) missing.push("base & wall units");
        if (!hasKitchenShutters) missing.push("shutters");
        if (!hasCountertop) missing.push("countertop");
        if (!hasTallUnit) missing.push("tall unit");
        if (!hasKitchenLoft) missing.push("loft");
        if (!hasKitchenAccessories) missing.push("accessories");
        if (missing.length === 6) {
            return "Modular kitchen — base and wall units, shutters, counter, tall unit, loft, accessories";
        }
        if (missing.length > 0) {
            return `Modular kitchen components: ${missing.join(", ")}`;
        }
        return null;
    }, [hasKitchenBaseWall, hasKitchenShutters, hasCountertop, hasTallUnit, hasKitchenLoft, hasKitchenAccessories]);

    const wardrobeExclusionText = useMemo(() => {
        const missing = [];
        if (!hasWardrobes) missing.push("wardrobes");
        if (!hasLofts) missing.push("lofts");
        if (!hasBeds) missing.push("beds");
        if (!hasStudy) missing.push("study units");
        if (missing.length === 4) {
            return "Wardrobes, lofts, beds and study units";
        }
        if (missing.length > 0) {
            return `Bedroom carpentry components: ${missing.join(", ")}`;
        }
        return null;
    }, [hasWardrobes, hasLofts, hasBeds, hasStudy]);

    const bathroomExclusionText = useMemo(() => {
        const missing = [];
        if (!hasVanity) missing.push("vanity base");
        if (!hasMirrorUnit) missing.push("mirror unit");
        if (!hasBathroomStorage) missing.push("storage");
        if (missing.length === 3) {
            return "Bathroom vanity, mirror unit and storage";
        }
        if (missing.length > 0) {
            return `Bathroom carpentry components: ${missing.join(", ")}`;
        }
        return null;
    }, [hasVanity, hasMirrorUnit, hasBathroomStorage]);

    const electricalFittingsExclusionText = useMemo(() => {
        return !hasElectricalFittings ? "Electrical fittings, decorative fixtures, switchgear and wiring materials" : null;
    }, [hasElectricalFittings]);

    const dbExclusionText = useMemo(() => {
        return !hasDbUpgrades ? "Distribution board upgrades and earthing works" : null;
    }, [hasDbUpgrades]);

    const looseFurnitureExclusionText = useMemo(() => {
        return !hasLooseFurniture ? "Loose furniture — sofas, chairs, dining sets, coffee tables" : null;
    }, [hasLooseFurniture]);

    const whiteGoodsExclusionText = useMemo(() => {
        return !hasWhiteGoods ? "White goods, kitchen hobs, chimneys, and electrical appliances" : null;
    }, [hasWhiteGoods]);

    const decorExclusionText = useMemo(() => {
        return !hasDecor ? "Décor, mattresses, wallpapers, curtains, blinds and soft furnishing" : null;
    }, [hasDecor]);

    const plumbingExclusionText = useMemo(() => {
        const missing = [];
        if (!hasPlumbing) missing.push("plumbing lines & fittings");
        if (!hasWaterproofing) missing.push("waterproofing works");
        if (missing.length === 2) {
            return "Plumbing, waterproofing and sanitaryware";
        }
        if (missing.length > 0) {
            return `${missing.join(" and ").replace(/^\w/, c => c.toUpperCase())}`;
        }
        return null;
    }, [hasPlumbing, hasWaterproofing]);

    const flooringExclusionText = useMemo(() => {
        return !hasFlooring ? "Flooring, tiling and stone work" : null;
    }, [hasFlooring]);

    const stoneCounterExclusionText = useMemo(() => {
        return !hasCountertop ? "Stone or quartz counter tops and cladding" : null;
    }, [hasCountertop]);

    const profileCoveExclusionText = useMemo(() => {
        return !hasProfileCove ? "Profile, cove and integrated LED lighting" : null;
    }, [hasProfileCove]);

    const veneerExclusionText = useMemo(() => {
        return !hasVeneerFluted ? "Veneer, fluted or upgraded panel finishes unless separately approved" : null;
    }, [hasVeneerFluted]);

    const administrativeExclusionText = "Government, municipal and society charges, deposits and permissions";

    const annexureExclusionsList = useMemo(() => {
        const raw = [
            kitchenExclusionText,
            wardrobeExclusionText,
            bathroomExclusionText,
            electricalFittingsExclusionText,
            dbExclusionText,
            looseFurnitureExclusionText,
            whiteGoodsExclusionText,
            decorExclusionText,
            plumbingExclusionText,
            flooringExclusionText,
            stoneCounterExclusionText,
            profileCoveExclusionText,
            veneerExclusionText,
            administrativeExclusionText
        ].filter(Boolean) as string[];
        
        const half = Math.ceil(raw.length / 2);
        const col1 = raw.slice(0, half);
        const col2 = raw.slice(half);
        return { col1, col2 };
    }, [
        kitchenExclusionText,
        wardrobeExclusionText,
        bathroomExclusionText,
        electricalFittingsExclusionText,
        dbExclusionText,
        looseFurnitureExclusionText,
        whiteGoodsExclusionText,
        decorExclusionText,
        plumbingExclusionText,
        flooringExclusionText,
        stoneCounterExclusionText,
        profileCoveExclusionText,
        veneerExclusionText
    ]);


    // Format utility
    const formatINR = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div ref={wrapperRef} className="vnext-proposal-wrapper bg-white min-h-screen text-slate-800 font-sans print:bg-white print:text-black">
            
            {/* ================= PAGE 1: COVER ================= */}
            {/* ================= PAGE 1: COVER ================= */}
            {(() => {
                const coverStyle = (projectContext as any).coverStyle || 'photo';
                
                if (coverStyle === 'minimal') {
                    return (
                        <div className="ff-page relative h-[29.7cm] flex flex-col justify-between bg-slate-50 text-[#1C1917] p-20">
                            {/* Inner gold hairline frame */}
                            <div className="absolute inset-8 border border-[#C5A880]/30 pointer-events-none"></div>
                            
                            <div className="flex flex-col gap-1 border-l-2 border-[#C5A880] pl-4 relative z-10">
                                <span className="text-xl font-black tracking-widest text-[#0F172A] font-serif">{settings?.companyName?.toUpperCase() || 'FORM FACTORS'}</span>
                                <span className="text-[9px] uppercase tracking-[0.3em] text-stone-500 font-sans"><Ed k="c350aa7c" ctl={edCtl}>DESIGN STUDIO</Ed></span>
                            </div>

                            <div className="flex-1 flex flex-col justify-center space-y-8 relative z-10 max-w-3xl">
                                <div className="space-y-3">
                                    <span className="text-[11px] uppercase tracking-[0.4em] text-[#C5A880] font-extrabold block font-sans">
                                        {isL2 ? 'Level 2 · Planning & Readiness Booklet' : isL15 ? 'Level 1.5 · Interim Scope Review' : 'Level 1 · Design-led Turnkey Proposal'}
                                    </span>
                                    <div className="h-[1px] w-12 bg-[#C5A880]"></div>
                                </div>
                                
                                <div className="space-y-4">
                                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-stone-900 font-serif">
                                        {projectContext.name || 'Your Residence'}
                                    </h1>
                                    <p className="text-lg md:text-xl text-[#C5A880] tracking-wider font-sans font-semibold uppercase">
                                        {projectContext.config || '2 BHK Residence'} — {projectContext.location || 'Site Location'}
                                    </p>
                                </div>
                                
                                <p className="text-stone-500 font-light max-w-xl text-sm leading-relaxed font-sans"><Ed k="a32a5e8e" ctl={edCtl}>
                                    A curated turnkey architectural journey integrating spatial design, detailed craftsmanship, material procurement, and precise on-site execution under a singular, cohesive design intent.
                                </Ed></p>
                                
                                <div className="inline-flex w-fit items-center gap-2 px-4 py-2 border border-[#C5A880]/40 rounded bg-white/70 text-[9px] font-bold uppercase tracking-widest text-[#C5A880] shadow-sm font-sans"><Ed k="bf223466" ctl={edCtl}>
                                    DESIGN + EXECUTION + HANDOVER · COHESIVE SYSTEM
                                </Ed></div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-stone-200 mt-auto relative z-10">
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="75469e61" ctl={edCtl}>PREPARED FOR</Ed></span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">{projectContext.clientName || 'Valued Client'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="40c3322b" ctl={edCtl}>LOCATION</Ed></span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">{projectContext.location || 'Mumbai'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="8c76abde" ctl={edCtl}>DATE</Ed></span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">{today}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="4ca06860" ctl={edCtl}>CONFIDENTIALITY</Ed></span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block"><Ed k="84c9cc88" ctl={edCtl}>CONFIDENTIAL</Ed></span>
                                </div>
                            </div>
                        </div>
                    );
                }

                if (coverStyle === 'photo') {
                    return (
                        <div className="ff-page relative h-[29.7cm] flex flex-col justify-between bg-slate-50 text-stone-800 p-20 overflow-hidden">
                            {/* Abstract linear layout mimicking architecture blueprint */}
                            <div className="absolute top-0 right-0 w-2/5 h-full opacity-10 border-l border-dashed border-[#C5A880]/50 pointer-events-none hidden md:block">
                                <div className="absolute top-1/4 right-0 w-96 h-96 rounded-full border border-[#C5A880]"></div>
                                <div className="absolute top-1/3 right-12 w-64 h-64 rounded-full border border-stone-400"></div>
                                <div className="absolute top-0 right-24 w-[1px] h-full bg-stone-300"></div>
                                <div className="absolute top-[40%] right-0 w-full h-[1px] bg-[#C5A880]/50"></div>
                            </div>

                            <div className="flex flex-col gap-1 border-l-2 border-[#C5A880] pl-4 relative z-10">
                                <span className="text-xl font-bold tracking-widest text-stone-900">{settings?.companyName?.toUpperCase() || 'FORM FACTORS'}</span>
                                <span className="text-[10px] uppercase tracking-[0.3em] text-stone-500"><Ed k="c350aa7c_2" ctl={edCtl}>DESIGN STUDIO</Ed></span>
                            </div>

                            <div className="flex-1 flex flex-col justify-center space-y-8 relative z-10 max-w-3xl">
                                <div className="space-y-2">
                                    <span className="text-xs uppercase tracking-[0.4em] text-[#C5A880] font-bold">
                                        {isL2 ? 'Level 2 · Planning & Readiness Booklet' : isL15 ? 'Level 1.5 · Interim Scope Review' : 'Level 1 · Design-led Turnkey Proposal'}
                                    </span>
                                    <div className="h-[2px] w-16 bg-stone-900 mt-2"></div>
                                </div>

                                <div className="space-y-6">
                                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-stone-950">
                                        {projectContext.name || 'Your Residence'}
                                    </h1>
                                    <p className="text-xl text-stone-600 font-light">
                                        {projectContext.config || '2 BHK Residence'} — {projectContext.location || 'Site Location'}
                                    </p>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 border border-stone-200 rounded text-[10px] font-bold uppercase tracking-wider text-stone-500"><Ed k="393b6e62" ctl={edCtl}>
                                        DESIGN + PLAN + BUILD
                                    </Ed></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-stone-200 mt-auto relative z-10">
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans"><Ed k="75469e61_2" ctl={edCtl}>PREPARED FOR</Ed></span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">{projectContext.clientName || 'Valued Client'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans"><Ed k="40c3322b_2" ctl={edCtl}>LOCATION</Ed></span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">{projectContext.location || 'Mumbai'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans"><Ed k="8c76abde_2" ctl={edCtl}>DATE</Ed></span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">{today}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans"><Ed k="4ca06860_2" ctl={edCtl}>CONFIDENTIALITY</Ed></span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1"><Ed k="84c9cc88_2" ctl={edCtl}>CONFIDENTIAL</Ed></span>
                                </div>
                            </div>
                        </div>
                    );
                }

                // Default "bold" (dark luxury slate)
                return (
                    <div className="ff-page relative h-[29.7cm] flex flex-col justify-between bg-[#0F172A] text-white p-20">
                        <div className="flex flex-col gap-1 border-l-2 border-[#C5A880] pl-4">
                            <span className="text-xl font-bold tracking-widest text-[#C5A880]">{settings?.companyName?.toUpperCase() || 'FORM FACTORS'}</span>
                            <span className="text-xs uppercase tracking-[0.3em] text-slate-400"><Ed k="c350aa7c_3" ctl={edCtl}>DESIGN STUDIO</Ed></span>
                        </div>

                        <div className="flex-1 flex flex-col justify-center space-y-6">
                            <span className="text-xs uppercase tracking-[0.4em] text-[#C5A880] font-bold">
                                {isL2 ? 'Level 2 · Planning & Readiness Booklet' : isL15 ? 'Level 1.5 · Interim Scope Review' : 'Level 1 · Design-led Turnkey Proposal'}
                            </span>
                            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-white">
                                {projectContext.name || 'Your Residence'}
                            </h1>
                            <p className="text-xl md:text-2xl text-slate-300 font-light max-w-2xl">
                                {projectContext.config || '2 BHK Residence'} — {projectContext.location || 'Site Location'}
                            </p>
                            
                            <div className="inline-flex w-fit items-center gap-2 px-4 py-2 border border-slate-700 rounded bg-slate-800/50 text-xs font-bold uppercase tracking-widest text-slate-300"><Ed k="457629c9" ctl={edCtl}>
                                DESIGN + EXECUTION + HANDOVER · ONE ENGAGEMENT
                            </Ed></div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-slate-800 mt-auto">
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="7e219bf0" ctl={edCtl}>Prepared For</Ed></span>
                                <span className="text-base font-bold text-white mt-1 block">{projectContext.clientName || 'Valued Client'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="d219c681" ctl={edCtl}>Location</Ed></span>
                                <span className="text-base font-bold text-white mt-1 block">{projectContext.location || 'Mumbai'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="eb9a4bc1" ctl={edCtl}>Date</Ed></span>
                                <span className="text-base font-bold text-white mt-1 block">{today}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold"><Ed k="642e7d86" ctl={edCtl}>Confidentiality</Ed></span>
                                <span className="text-base font-bold text-white mt-1 block"><Ed k="4f853c51" ctl={edCtl}>Confidential</Ed></span>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ================= PAGE 2: RECOMMENDATION ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-slate-50 border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="997e149f" ctl={edCtl}>Our Recommendation</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="de24ac9e" ctl={edCtl}>One team, one responsibility</Ed></h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-center">
                    <div className="lg:col-span-6 space-y-6">
                        <p className="text-xl font-bold leading-relaxed text-slate-800">
                            We recommend delivering your home as a <strong className="text-[#0F172A] border-b border-[#C5A880]">single design-led turnkey engagement</strong>.
                        </p>
                        <p className="text-slate-600 text-base leading-relaxed"><Ed k="d6792a73" ctl={edCtl}>
                            Design, materials, procurement, execution, and handover stay under one coordinated responsibility. This completely eliminates alignment friction, vendor gaps, and surprise budget overruns, leaving you with one professional team to hold accountable rather than a fragmented chain of contractors.
                        </Ed></p>
                    </div>

                    <div className="lg:col-span-6 space-y-4">
                        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4">
                            <span className="text-2xl font-black text-[#C5A880] shrink-0 font-mono">01</span>
                            <div>
                                <h4 className="font-bold text-slate-900 text-base"><Ed k="6ddd4aad" ctl={edCtl}>End-to-end execution</Ed></h4>
                                <p className="text-xs text-slate-500 mt-1">{settings?.companyName || 'FFDS'} contracts, procures, executes and supervises the listed scope entirely.</p>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4">
                            <span className="text-2xl font-black text-[#C5A880] shrink-0 font-mono">02</span>
                            <div>
                                <h4 className="font-bold text-slate-900 text-base"><Ed k="8b8f29ee" ctl={edCtl}>Written specifications</Ed></h4>
                                <p className="text-xs text-slate-500 mt-1"><Ed k="10e01851" ctl={edCtl}>Every material grade, brand and finish is explicitly documented and confirmed against physical samples.</Ed></p>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4">
                            <span className="text-2xl font-black text-[#C5A880] shrink-0 font-mono">03</span>
                            <div>
                                <h4 className="font-bold text-slate-900 text-base"><Ed k="51e28c99" ctl={edCtl}>Defined programme</Ed></h4>
                                <p className="text-xs text-slate-500 mt-1">{totalDays} working days with start conditions clearly defined, ensuring any delay has a transparent, visible cause.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 3: INVESTMENT ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="bc1e536e" ctl={edCtl}>The Investment</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="bc21dc00" ctl={edCtl}>Total proposed project investment</Ed></h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-5 bg-[#0F172A] text-white p-8 rounded-2xl flex flex-col justify-between shadow-xl">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold"><Ed k="922c6988" ctl={edCtl}>TOTAL, ALL INCLUSIVE</Ed></span>
                            <div className="text-3xl md:text-4xl font-black mt-4 font-mono text-white">
                                {isL2 || investmentMin === investmentMax ? formatINR(totalProposedInvestment) : `${formatINR(investmentMin)} - ${formatINR(investmentMax)}`}
                            </div>
                            <span className="text-xs text-slate-400 mt-2 block">Inclusive of applicable GST at {gstRate}%</span>
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-800 text-xs text-slate-300 leading-relaxed space-y-3">
                            <p>
                                <strong className="text-white">Current proposed value.</strong> The final turnkey order value is confirmed after site validation, design freeze, Schedule of Finishes approval and final BOQ sign-off.
                            </p>
                        </div>
                    </div>

                    <div className="lg:col-span-7 flex flex-col justify-center">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider">
                                    <th className="text-left py-3">Component</th>
                                    <th className="text-left py-3">Basis</th>
                                    <th className="text-right py-3">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr>
                                    <td className="py-4 font-bold text-slate-800"><Ed k="1c9dfb1a" ctl={edCtl}>Turnkey Execution Value</Ed></td>
                                    <td className="py-4 text-slate-500"><Ed k="277d53ce" ctl={edCtl}>As listed scope</Ed></td>
                                    <td className="py-4 text-right font-mono font-bold text-slate-950">{formatINR(taxableExecution)}</td>
                                </tr>
                                <tr>
                                    <td className="py-4 font-bold text-slate-800"><Ed k="b7b78706" ctl={edCtl}>Design & Coordination Fee</Ed></td>
                                    <td className="py-4 text-slate-500">{designFeeBasis}</td>
                                    <td className="py-4 text-right font-mono font-bold text-slate-950">{formatINR(taxableDesign)}</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold">
                                    <td className="py-4 px-3 text-slate-800"><Ed k="857af574" ctl={edCtl}>Net Taxable Value</Ed></td>
                                    <td className="py-4 px-3"></td>
                                    <td className="py-4 px-3 text-right font-mono text-slate-950">{formatINR(netTaxableValue)}</td>
                                </tr>
                                <tr>
                                    <td className="py-4 font-bold text-slate-800"><Ed k="a6bbe567" ctl={edCtl}>Applicable GST</Ed></td>
                                    <td className="py-4 text-slate-500">{gstRate}% on {settings?.companyName || 'FFDS'} invoiced value</td>
                                    <td className="py-4 text-right font-mono font-bold text-slate-950">{formatINR(gstOnDesign + chargedGstOnExecution)}</td>
                                </tr>
                                <tr className="border-t-2 border-[#0F172A] font-black text-base">
                                    <td className="py-4 text-slate-950"><Ed k="ff35f1cc" ctl={edCtl}>Total Project Investment</Ed></td>
                                    <td className="py-4"></td>
                                    <td className="py-4 text-right font-mono text-[#0F172A]">{formatINR(totalProposedInvestment)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 4: AT A GLANCE ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-slate-50 border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="a2556701" ctl={edCtl}>At a Glance</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="2d1064e2" ctl={edCtl}>What is included</Ed></h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 my-auto">
                    <div className="space-y-6">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block border-b border-slate-200 pb-2"><Ed k="fa2c179a" ctl={edCtl}>IN THE TURNKEY SCOPE</Ed></span>
                        <EdPairList k="included.turnkey" ctl={edCtl} items={dynamicInclusions} variant="include" />
                    </div>

                    <div className="space-y-6">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block border-b border-slate-200 pb-2"><Ed k="8abab0ff" ctl={edCtl}>NOT INCLUDED IN BASELINE</Ed></span>
                        <EdPairList k="included.baseline" ctl={edCtl} items={dynamicExclusions} variant="exclude" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 text-xs text-slate-600 flex justify-between items-center">
                    <span><strong>Scope Discipline:</strong> This booklet prices only the turnkey package items. Other carpentry can be quoted separately as addendums.</span>
                    <span className="font-bold uppercase tracking-wider text-slate-900 shrink-0 ml-4"><Ed k="2a663f52" ctl={edCtl}>Full Exclusions · Annexure A</Ed></span>
                </div>
            </div>

            {/* ================= PAGE 5: HOW WE WORK ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="d324337c" ctl={edCtl}>How We Work</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="9ff8a7d6" ctl={edCtl}>From concept to handover</Ed></h2>
                </div>

                <div className="grid grid-cols-5 gap-4 my-auto relative pt-12">
                    {/* Connecting line */}
                    <div className="absolute top-16 left-[10%] right-[10%] h-[2px] bg-slate-200 -z-10 hidden md:block" />

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">01</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide"><Ed k="3b3290c7" ctl={edCtl}>Discovery</Ed></h4>
                        <p className="text-[10px] text-slate-500 mt-2"><Ed k="ad257639" ctl={edCtl}>Brief capture & initial space measurement survey.</Ed></p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">02</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide"><Ed k="d03f0fd3" ctl={edCtl}>Concept & 3D</Ed></h4>
                        <p className="text-[10px] text-slate-500 mt-2"><Ed k="b483a809" ctl={edCtl}>Detailed layout designs & 3D visual renders for approval.</Ed></p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">03</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide"><Ed k="f3925233" ctl={edCtl}>Design Freeze</Ed></h4>
                        <p className="text-[10px] text-slate-500 mt-2"><Ed k="213dcccb" ctl={edCtl}>GFC technical drawing releases & BOQ freeze.</Ed></p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">04</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide"><Ed k="3fc79400" ctl={edCtl}>Procurement</Ed></h4>
                        <p className="text-[10px] text-slate-500 mt-2"><Ed k="e2ffde06" ctl={edCtl}>Material ordering, carcass fabrication, and setup.</Ed></p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#C5A880] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">05</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide"><Ed k="18a88df1" ctl={edCtl}>Finishing</Ed></h4>
                        <p className="text-[10px] text-slate-500 mt-2"><Ed k="e3d5790f" ctl={edCtl}>Final site installations, quality audit, and handover.</Ed></p>
                    </div>
                </div>

                <div className="bg-slate-900 text-white p-6 rounded-xl space-y-2">
                    <p className="text-xs text-slate-300">
                        <strong className="text-white block mb-1 text-sm">Why the order matters:</strong>
                        Stages 1 to 3 fix the scope, the specification and the quantities. Once Stage 3 is signed off, the order value, the material list and the programme all work from the same document. Each stage begins on receipt of the corresponding approval and stage payment.
                    </p>
                </div>
            </div>

            {/* ================= PAGE 6: DESIGN INTEGRATION ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-slate-50 border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="bac0bdd7" ctl={edCtl}>Design & Execution</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="e516995e" ctl={edCtl}>Design is integrated into the turnkey process</Ed></h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-6 space-y-6 flex flex-col justify-center">
                        <p className="text-lg text-slate-700 leading-relaxed">
                            Planning, visualisation, detailing, and material specification are completed <strong className="text-[#0F172A] font-extrabold">before procurement and execution decisions are taken</strong>.
                        </p>
                        <p className="text-sm text-slate-500 leading-relaxed"><Ed k="362ddecb" ctl={edCtl}>
                            This reduces rework, controls scope changes, and gives the site team one clear reference to build to. Design is not an add-on — it is what makes a firm turnkey value possible.
                        </Ed></p>
                    </div>

                    <div className="lg:col-span-6 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1"><Ed k="97d5fce2" ctl={edCtl}>DESIGN & COORDINATION FEE</Ed></span>
                            <div className="text-3xl font-black font-mono text-[#0F172A]">{formatINR(taxableDesign)}</div>
                            <span className="text-xs text-slate-400 block mt-1">{designFeeBasis}, exclusive of GST</span>
                        </div>

                        <div className="mt-6">
                            <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-black block mb-3"><Ed k="8d19175a" ctl={edCtl}>WHAT IT COVERS</Ed></span>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="0f759dd2" ctl={edCtl}>Layouts & space planning</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="46b04044" ctl={edCtl}>3D views</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="139f253c" ctl={edCtl}>GFC & joinery drawings</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="fb75daba" ctl={edCtl}>Electrical & ceiling layouts</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="ab5cc160" ctl={edCtl}>Material specification</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="3f3fa0a2" ctl={edCtl}>Schedule of Finishes</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="5b30dd3f" ctl={edCtl}>Final BOQ</Ed></span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium"><Ed k="475957ac" ctl={edCtl}>Site coordination</Ed></span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 text-xs text-slate-500">
                    <strong>One engagement.</strong> The design fee and execution value are shown separately for billing clarity only. They are not separable commitments.
                </div>
            </div>

            {/* ================= PAGE 7: PROPOSED PACKAGE ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="4321be74" ctl={edCtl}>Section 3 · Scope</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="e51393dd" ctl={edCtl}>Proposed turnkey package</Ed></h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-7 bg-slate-50 p-8 rounded-2xl border border-slate-200 flex flex-col justify-between">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block"><Ed k="ba7c5345" ctl={edCtl}>RECOMMENDED EXECUTION PACKAGE</Ed></span>
                            <h3 className="text-2xl font-extrabold text-[#0F172A] mt-1">{projectContext.name} Turnkey Package</h3>
                            
                            <ul className="mt-6 space-y-3 text-slate-600 text-sm">
                                {dynamicBulletPoints.map((bullet, i) => (
                                    <li key={i} className="flex gap-2">{bullet}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-xs text-slate-500"><Ed k="2c785757" ctl={edCtl}>Quantities are presently estimated.</Ed></span>
                            <span className="text-xs font-bold text-slate-800"><Ed k="66cc6ac1" ctl={edCtl}>VARIATION TERMS · ANNEXURE A</Ed></span>
                        </div>
                    </div>

                    <div className="lg:col-span-5 flex flex-col justify-between border border-slate-200 rounded-2xl p-8">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block"><Ed k="d0d0f8ce" ctl={edCtl}>QUANTUM OF WORK</Ed></span>
                            
                            <div className="mt-6 space-y-4">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                                    <span className="font-bold text-[#0F172A]"><Ed k="7318f6a2" ctl={edCtl}>Carpentry</Ed></span>
                                    <span className="font-mono text-slate-600 font-bold">{carpentryQuantum}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                                    <span className="font-bold text-[#0F172A]"><Ed k="b9c2becd" ctl={edCtl}>Ceiling & paint</Ed></span>
                                    <span className="font-mono text-slate-600 font-bold">{ceilingAndPaintQuantum}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                                    <span className="font-bold text-[#0F172A]"><Ed k="16ec3073" ctl={edCtl}>Electrical</Ed></span>
                                    <span className="font-mono text-slate-600 font-bold">{electricalQuantum}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 py-3 border-y border-slate-200 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500"><Ed k="33310bb0" ctl={edCtl}>
                            SINGLE PACKAGE · NO TIERS
                        </Ed></div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 8: SCOPE - CARPENTRY ================= */}
            <div className="ff-page ff-page-flow min-h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="6f9ca747" ctl={edCtl}>Section 3.1</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="7c1f8368" ctl={edCtl}>Scope of works — carpentry</Ed></h2>
                </div>

                <div className="my-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                <th className="py-3">Item</th>
                                <th className="py-3">Area</th>
                                <th className="py-3 text-right">Qty</th>
                                <th className="py-3 text-left pl-4">Unit</th>
                                {showScopePricing && !isDesigner && (
                                    <>
                                        <th className="py-3 text-right">Rate</th>
                                        <th className="py-3 text-right">Amount</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {carpentryItems.length > 0 ? (
                                carpentryItems.map((item, idx) => {
                                    const sellRate = calculateSellPrice(item.materials, item.labor, item.margin);
                                    const lineTotal = sellRate * item.qty;
                                    return (
                                        <tr key={idx}>
                                            <td className="py-3 font-bold text-slate-800">{item.name}</td>
                                            <td className="py-3 text-slate-500">{item.roomId || 'General'}</td>
                                            <td className="py-3 text-right font-mono font-bold text-[#0F172A]">{item.qty}</td>
                                            <td className="py-3 text-left pl-4 text-slate-500">{item.unit}</td>
                                            {showScopePricing && !isDesigner && (
                                                <>
                                                    <td className="py-3 text-right font-mono text-slate-600">{formatINR(sellRate)}</td>
                                                    <td className="py-3 text-right font-mono font-bold text-[#0F172A]">{formatINR(lineTotal)}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })
                            ) : (
                                <>
                                    <tr>
                                        <td className="py-4 font-bold text-slate-800"><Ed k="d4638d44" ctl={edCtl}>Security door laminate finish</Ed></td>
                                        <td className="py-4 text-slate-500"><Ed k="aa4bbfb3" ctl={edCtl}>Entrance</Ed></td>
                                        <td className="py-4 text-right font-mono font-bold text-[#0F172A]">21</td>
                                        <td className="py-4 text-left pl-4 text-slate-500"><Ed k="77a7645b" ctl={edCtl}>sq ft</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-4 text-right font-mono text-slate-600">{formatINR(1200)}</td>
                                                <td className="py-4 text-right font-mono font-bold text-[#0F172A]">{formatINR(25200)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-4 font-bold text-slate-800"><Ed k="228f2b18" ctl={edCtl}>T.V. unit (drawer)</Ed></td>
                                        <td className="py-4 text-slate-500"><Ed k="1f2b9fab" ctl={edCtl}>Living</Ed></td>
                                        <td className="py-4 text-right font-mono font-bold text-[#0F172A]">12</td>
                                        <td className="py-4 text-left pl-4 text-slate-500"><Ed k="77a7645b_2" ctl={edCtl}>sq ft</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-4 text-right font-mono text-slate-600">{formatINR(1500)}</td>
                                                <td className="py-4 text-right font-mono font-bold text-[#0F172A]">{formatINR(18000)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-4 font-bold text-slate-800"><Ed k="e1fc43d5" ctl={edCtl}>TV wall panelling</Ed></td>
                                        <td className="py-4 text-slate-500"><Ed k="1f2b9fab_2" ctl={edCtl}>Living</Ed></td>
                                        <td className="py-4 text-right font-mono font-bold text-[#0F172A]">24</td>
                                        <td className="py-4 text-left pl-4 text-slate-500"><Ed k="77a7645b_3" ctl={edCtl}>sq ft</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-4 text-right font-mono text-slate-600">{formatINR(800)}</td>
                                                <td className="py-4 text-right font-mono font-bold text-[#0F172A]">{formatINR(19200)}</td>
                                            </>
                                        )}
                                    </tr>
                                </>
                            )}
                            {showScopePricing && !isDesigner && carpentryItems.length > 0 && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50/50 font-bold">
                                    <td className="py-3 text-slate-800" colSpan={2}><Ed k="d1509fe5" ctl={edCtl}>Total Carpentry</Ed></td>
                                    <td className="py-3 text-right font-mono text-[#0F172A]">
                                        {carpentryItems.length}
                                    </td>
                                    <td className="py-3 text-left pl-4 text-slate-500" colSpan={2}>lines</td>
                                    <td className="py-3 text-right font-mono font-extrabold text-[#0F172A]">
                                        {formatINR(carpentryItems.reduce((sum, item) => sum + (calculateSellPrice(item.materials, item.labor, item.margin) * item.qty), 0))}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className="mt-8 p-6 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-600">
                        <p><strong>Included in every carpentry line:</strong> Custom fabrication and installation including carcass, shutters and panels, basic hardware, and laminate or paint finish as per approved drawings.</p>
                        <p><strong>Excluded:</strong> Stone or quartz tops, profile and cove lighting, TV brackets, veneer or fluted upgrades, and replacement door hardware or lock sets.</p>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 9: SCOPE - CIVIL & FINISHING ================= */}
            <div className="ff-page ff-page-flow min-h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="b4e5ce56" ctl={edCtl}>Section 3.2</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="ddb5abea" ctl={edCtl}>Scope of works — civil, services, finishing</Ed></h2>
                </div>

                <div className="my-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                <th className="py-3">Item</th>
                                <th className="py-3">Area</th>
                                <th className="py-3">Trade</th>
                                <th className="py-3 text-right">Qty</th>
                                <th className="py-3 text-left pl-4">Unit</th>
                                {showScopePricing && !isDesigner && (
                                    <>
                                        <th className="py-3 text-right">Rate</th>
                                        <th className="py-3 text-right">Amount</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {otherItems.length > 0 ? (
                                otherItems.map((item, idx) => {
                                    const sellRate = calculateSellPrice(item.materials, item.labor, item.margin);
                                    const lineTotal = sellRate * item.qty;
                                    return (
                                        <tr key={idx}>
                                            <td className="py-2 font-bold text-slate-800">{item.name}</td>
                                            <td className="py-2 text-slate-500">{item.roomId || '\u2014'}</td>
                                            <td className="py-2 text-slate-500">{item.cat || 'Finishing'}</td>
                                            <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{item.qty}</td>
                                            <td className="py-2 text-left pl-4 text-slate-500">{item.unit}</td>
                                            {showScopePricing && !isDesigner && (
                                                <>
                                                    <td className="py-2 text-right font-mono text-slate-600">{formatINR(sellRate)}</td>
                                                    <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(lineTotal)}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })
                            ) : (
                                <>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800"><Ed k="50b6a192" ctl={edCtl}>POP false ceiling (Standard)</Ed></td>
                                        <td className="py-2 text-slate-500">—</td>
                                        <td className="py-2 text-slate-500"><Ed k="496b2073" ctl={edCtl}>Civil</Ed></td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">720</td>
                                        <td className="py-2 text-left pl-4 text-slate-500"><Ed k="77a7645b_4" ctl={edCtl}>sq ft</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(120)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(86400)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800"><Ed k="3cc08028" ctl={edCtl}>Electrical (labour / point)</Ed></td>
                                        <td className="py-2 text-slate-500">—</td>
                                        <td className="py-2 text-slate-500"><Ed k="5cbd5840" ctl={edCtl}>Services</Ed></td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">30</td>
                                        <td className="py-2 text-left pl-4 text-slate-500"><Ed k="008870b4" ctl={edCtl}>nos</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(250)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(7500)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800"><Ed k="b62aa3ac" ctl={edCtl}>Electrical fittings (as actuals)</Ed></td>
                                        <td className="py-2 text-slate-500">—</td>
                                        <td className="py-2 text-slate-500"><Ed k="5cbd5840_2" ctl={edCtl}>Services</Ed></td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">1</td>
                                        <td className="py-2 text-left pl-4 text-slate-500"><Ed k="505e565c" ctl={edCtl}>lumpsum</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(15000)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(15000)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800"><Ed k="7df1b6eb" ctl={edCtl}>Interior painting (Standard)</Ed></td>
                                        <td className="py-2 text-slate-500">—</td>
                                        <td className="py-2 text-slate-500"><Ed k="18a88df1_2" ctl={edCtl}>Finishing</Ed></td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">1,575</td>
                                        <td className="py-2 text-left pl-4 text-slate-500"><Ed k="77a7645b_5" ctl={edCtl}>sq ft</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(35)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(55125)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800"><Ed k="d6b3aea0" ctl={edCtl}>Interior ceiling painting</Ed></td>
                                        <td className="py-2 text-slate-500">—</td>
                                        <td className="py-2 text-slate-500"><Ed k="18a88df1_3" ctl={edCtl}>Finishing</Ed></td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">750</td>
                                        <td className="py-2 text-left pl-4 text-slate-500"><Ed k="77a7645b_6" ctl={edCtl}>sq ft</Ed></td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(30)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(22500)}</td>
                                            </>
                                        )}
                                    </tr>
                                </>
                            )}
                            {showScopePricing && !isDesigner && otherItems.length > 0 && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50/50 font-bold">
                                    <td className="py-2 text-slate-800" colSpan={3}><Ed k="5baed93c" ctl={edCtl}>Total Civil, Services & Finishing</Ed></td>
                                    <td className="py-2 text-right font-mono text-[#0F172A]">
                                        {otherItems.length}
                                    </td>
                                    <td className="py-2 text-left pl-4 text-slate-500" colSpan={2}>lines</td>
                                    <td className="py-2 text-right font-mono font-extrabold text-[#0F172A]">
                                        {formatINR(otherItems.reduce((sum, item) => sum + (calculateSellPrice(item.materials, item.labor, item.margin) * item.qty), 0))}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className="mt-6 p-6 bg-slate-50 rounded-xl text-xs text-slate-500 leading-relaxed"><Ed k="38f2ba50" ctl={edCtl}>
                        Electrical fittings are billed at actual supplier cost against your approved selection and are not part of the fixed value. Electrical labour covers wiring, conduit, fixing and testing per point; materials are charged separately. Painting includes surface preparation, primer and two coats.
                    </Ed></div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 11: SPECIFICATIONS ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="6d1ba83e" ctl={edCtl}>Section 4</Ed></span>
                            <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="0c709f98" ctl={edCtl}>Specifications</Ed></h2>
                        </div>
                        {!isClientViewOnly && setProjectContext && (
                            <button
                                onClick={startEditingSpecs}
                                className="flex items-center gap-2 px-4 py-2 border border-[#C5A880] text-xs font-bold text-[#C5A880] rounded hover:bg-[#C5A880]/10 transition duration-150 shadow-sm no-print"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit Specifications
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-7">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                    <th className="py-3">Category</th>
                                    <th className="py-3">Specified Standard</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {dynamicSpecs.map((spec, idx) => (
                                    <tr key={idx}>
                                        <td className="py-3 font-bold">{spec.category}</td>
                                        <td className="py-3">{spec.value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="lg:col-span-5 flex flex-col justify-between border border-slate-200 rounded-2xl p-6 bg-slate-50">
                        <div>
                            <span className="text-xs font-bold text-slate-900 block mb-2"><Ed k="2af1d756" ctl={edCtl}>Sample approvals</Ed></span>
                            <p className="text-xs text-slate-500 leading-relaxed"><Ed k="b5548d9e" ctl={edCtl}>Final brands, shades and finishes are selected against physical samples during the Schedule of Finishes stage and recorded in writing. No substitution is made without your approval.</Ed></p>
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-200">
                            <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-black block mb-3"><Ed k="4cd58ab9" ctl={edCtl}>NOT SPECIFIED — NOT IN SCOPE</Ed></span>
                            <div className="flex flex-col gap-2 text-xs text-slate-400">
                                {dynamicSpecExclusions.map((spec, i) => (
                                    <span key={i}>{spec}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 12: PROGRAMME ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="d64254df" ctl={edCtl}>Section 5</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">{totalDays}-day site programme</h2>
                </div>

                <EdPhaseCards k="programme.phases" ctl={edCtl} items={derivedPhases} />

                <div className="bg-[#0F172A] text-white p-6 rounded-xl space-y-2">
                    <p className="text-xs text-slate-300">
                        <strong className="text-white block mb-1">PROGRAMME STARTS WHEN ALL FOUR ARE IN PLACE:</strong>
                        Design and material freeze with SOF approved · Stage payment received · Site vacant and available · Society permissions confirmed. {totalDays} working days, excluding Sundays and public holidays. Custom or imported materials need 4-6 weeks and sit outside this baseline unless ordered at freeze.
                    </p>
                </div>
            </div>

            {/* ================= PAGE 13: PAYMENT SCHEDULE ================= */}
            <div className="ff-page ff-page-flow min-h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="0e8720cd" ctl={edCtl}>Section 6</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="17b13ad2" ctl={edCtl}>Payment schedule</Ed></h2>
                </div>

                <div className="my-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                <th className="py-3">Stage</th>
                                <th className="py-3">Trigger</th>
                                <th className="py-3 text-right">Share</th>
                                <th className="py-3 text-right pl-4">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr>
                                <td className="py-3 font-bold text-[#0F172A]"><Ed k="98bb44b9" ctl={edCtl}>Initiation</Ed></td>
                                <td className="py-3 text-slate-500"><Ed k="28d06359" ctl={edCtl}>On appointment, to commence site validation & planning</Ed></td>
                                <td className="py-3 text-right font-mono font-bold">-</td>
                                <td className="py-3 text-right font-mono font-bold text-slate-900">{formatINR(4999)}</td>
                            </tr>
                            <tr className="bg-slate-50 font-bold">
                                <td className="py-2.5 px-2 text-xs uppercase text-[#C5A880]" colSpan={2}>DESIGN & COORDINATION FEE — {formatINR(taxableDesign)}</td>
                                <td className="py-2.5 px-2"></td>
                                <td className="py-2.5 px-2"></td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="f14492d5" ctl={edCtl}>Design 1</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="c2b987f2" ctl={edCtl}>Brief freeze, site measurement and commencement of concept</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">25%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableDesign * 0.25)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="81ede823" ctl={edCtl}>Design 2</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="e4232828" ctl={edCtl}>On presentation of layouts and 3D views for approval</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">40%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableDesign * 0.40)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="4eefd70a" ctl={edCtl}>Design 3</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="775ec892" ctl={edCtl}>On release of GFC drawings, Schedule of Finishes and final BOQ</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">35%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableDesign * 0.35)}</td>
                            </tr>
                            <tr className="bg-slate-50 font-bold">
                                <td className="py-2.5 px-2 text-xs uppercase text-[#C5A880]" colSpan={2}>TURNKEY EXECUTION VALUE — {formatINR(taxableExecution)}</td>
                                <td className="py-2.5 px-2"></td>
                                <td className="py-2.5 px-2"></td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="8b135a5f" ctl={edCtl}>Execution 1</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="909d000c" ctl={edCtl}>Before mobilisation and placement of material orders</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">40%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.40)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="d4e949c7" ctl={edCtl}>Execution 2</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="f09a996a" ctl={edCtl}>On completion of civil, services, ceiling framework and carcasses</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">30%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.30)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="32ffe7f0" ctl={edCtl}>Execution 3</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="a5b60cb3" ctl={edCtl}>Before shutters, finishes, hardware and final paint</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">20%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.20)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700"><Ed k="39e0e0f0" ctl={edCtl}>Execution 4</Ed></td>
                                <td className="py-2.5 text-xs text-slate-500"><Ed k="98c3d2b7" ctl={edCtl}>Before final handover and key release, following agreed scope & snag list closure</Ed></td>
                                <td className="py-2.5 text-right font-mono text-slate-600">10%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.10)}</td>
                            </tr>
                            <tr className="border-t-2 border-[#0F172A] font-black">
                                <td className="py-3 text-[#0F172A]"><Ed k="a385af23" ctl={edCtl}>Net taxable value</Ed></td>
                                <td className="py-3"></td>
                                <td className="py-3 text-right font-mono">100%</td>
                                <td className="py-3 text-right font-mono text-[#0F172A]">{formatINR(netTaxableValue)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex justify-between gap-4">
                        <span><Ed k="1374c077" ctl={edCtl}>Payable in advance of each stage. GST at 18% is added on every FFDS invoice. The ₹4,999 is adjusted against Design 1 and is not additional to the total.</Ed></span>
                        <span className="font-bold shrink-0 text-slate-800"><Ed k="3ce4832e" ctl={edCtl}>FULL TERMS · ANNEXURE A</Ed></span>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 14: NEXT STEPS ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-slate-50 border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="574f02b7" ctl={edCtl}>Next Step</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="150ec235" ctl={edCtl}>Proceed with design-led turnkey execution</Ed></h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-6 space-y-4">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block border-b pb-2"><Ed k="560c1369" ctl={edCtl}>WHAT HAPPENS NEXT</Ed></span>
                        
                        <div className="space-y-3 text-sm text-slate-700">
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">01</span>
                                <p><Ed k="dd8e8d7d" ctl={edCtl}>Project initiation fee payment of ₹4,999.</Ed></p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">02</span>
                                <p><Ed k="37c726a2" ctl={edCtl}>Site measurement and scope validation survey.</Ed></p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">03</span>
                                <p><Ed k="27c81bbe" ctl={edCtl}>Layout, concept and detailed design development.</Ed></p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">04</span>
                                <p><Ed k="fad362f2" ctl={edCtl}>Schedule of Finishes (SOF) and physical material approvals.</Ed></p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">05</span>
                                <p><Ed k="62df687b" ctl={edCtl}>Final detailed BOQ and commercial confirmation sign-off.</Ed></p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">06</span>
                                <p><Ed k="24de6d5f" ctl={edCtl}>Execution agreement sign-off and site mobilization.</Ed></p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-8 flex flex-col justify-between shadow-sm">
                        <div className="text-center">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block"><Ed k="f4caddd0" ctl={edCtl}>PROJECT INITIATION FEE</Ed></span>
                            <div className="text-4xl font-black font-mono text-[#0F172A] mt-2">₹4,999</div>
                            <p className="text-xs text-slate-500 mt-3 leading-relaxed"><Ed k="d8a17b45" ctl={edCtl}>
                                Commences site validation, requirement documentation, and preliminary scope finalisation. Non-refundable, but fully adjustable against the final turnkey order value.
                            </Ed></p>
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <p className="text-[10px] text-slate-400 text-center italic mb-4"><Ed k="1a8a34c3" ctl={edCtl}>Not covered by this fee: layouts, 3D views, GFC drawings, SOF and final BOQ. These commence under main engagement design stages.</Ed></p>
                            <button className="w-full bg-[#3D52A0] text-white py-3.5 rounded-xl font-bold hover:bg-[#334486] transition-all text-sm uppercase tracking-wider shadow-md">
                                Initiate Turnkey Planning
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= PAGE 15: CONFIRMATION ================= */}
            <div className="ff-page h-[29.7cm] flex flex-col justify-between p-20 bg-white border-b border-slate-200">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]"><Ed k="a69d9d5f" ctl={edCtl}>Acceptance</Ed></span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight"><Ed k="462cb5af" ctl={edCtl}>Confirmation of engagement</Ed></h2>
                </div>

                <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 text-slate-600 text-sm leading-relaxed my-auto space-y-4">
                    <p>
                        By signing below, the client confirms acceptance of the scope, specifications, programme conditions and payment schedule in this booklet, together with <strong className="text-slate-900 font-bold">Annexure A — Commercial Terms & Conditions</strong>, as the basis for the design-led turnkey engagement. The Final Turnkey Order Value will be issued for separate written acceptance after design freeze and final BOQ.
                    </p>
                    {latestDocket ? (
                        <div className="pt-3 border-t border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-500">
                            <div className="p-1 bg-[#C5A880]/10 rounded-md text-[#C5A880] shrink-0 mt-0.5">
                                <ShieldCheckIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <span className="font-bold text-slate-700"><Ed k="1d06487e" ctl={edCtl}>Contractual Integration & Alignment:</Ed></span> This proposal and Annexure A are verbally and legally linked with Master Terms Docket <strong className="font-semibold text-slate-800">{latestDocket.docketRef}</strong> (Status: <span className="font-bold text-[#C5A880]">{latestDocket.status.toUpperCase()}</span>), which governs the overarching terms of service. In the event of any operational conflict, the clauses of the Master Terms Docket shall prevail.
                            </div>
                        </div>
                    ) : (
                        <div className="pt-3 border-t border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-500">
                            <div className="p-1 bg-[#C5A880]/10 rounded-md text-[#C5A880] shrink-0 mt-0.5">
                                <ShieldCheckIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <span className="font-bold text-slate-700"><Ed k="1d06487e_2" ctl={edCtl}>Contractual Integration & Alignment:</Ed></span> This proposal and Annexure A are verbally and legally linked to the Master Terms Docket once issued for this project. The Master Terms Docket governs the overarching terms of service and takes precedence over any generic operational clauses.
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-12 mt-12 pt-12 border-t border-slate-200">
                    <div className="space-y-8">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block"><Ed k="ae1f3f57" ctl={edCtl}>FOR FORM FACTORS DESIGN STUDIO</Ed></span>
                        <div className="h-12 border-b border-slate-300"></div>
                        <span className="text-[10px] text-slate-500 uppercase block tracking-widest"><Ed k="d9b85af9" ctl={edCtl}>AUTHORISED SIGNATORY · NAME, SIGNATURE & DATE</Ed></span>
                    </div>

                    <div className="space-y-8">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block"><Ed k="865936f7" ctl={edCtl}>ACCEPTED & APPROVED BY CLIENT</Ed></span>
                        <div className="h-12 border-b border-slate-300"></div>
                        <span className="text-[10px] text-slate-500 uppercase block tracking-widest">{projectContext.clientName?.toUpperCase() || 'CLIENT'} · SIGNATURE & DATE</span>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8 mt-auto">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page <span className="ff-pageno" /> of {pageTotal || '—'}</span>
                </div>
            </div>

            {/* ================= ANNEXURE A: TERMS & CONDITIONS ================= */}
            <div className="ff-page ff-page-flow p-20 bg-white space-y-8">
                <div className="border-b-2 border-[#0F172A] pb-4">
                    <span className="text-[11px] font-bold text-[#C5A880] uppercase tracking-wider block"><Ed k="43ec7149" ctl={edCtl}>ANNEXURE A</Ed></span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-[#0F172A] mt-1"><Ed k="e555dbd3" ctl={edCtl}>Commercial Terms & Conditions</Ed></h2>
                    <p className="text-xs text-slate-500 mt-1"><Ed k="530cebd7" ctl={edCtl}>Forms part of the Design-led Turnkey Proposal booklet and is to be read together with it.</Ed></p>
                </div>

                {latestDocket ? (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-3 max-w-4xl">
                        <div className="p-1 bg-[#C5A880]/10 rounded text-[#C5A880] shrink-0 mt-0.5">
                            <ShieldCheckIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <strong className="text-slate-800 font-bold block mb-1">Contractual Integration & Alignment Note</strong>
                            This commercial Annexure forms part of the master contractual framework and is verbally and legally integrated with <strong className="text-slate-900 font-semibold">Master Terms Docket {latestDocket.docketRef}</strong> (Status: <span className="font-bold text-[#C5A880]">{latestDocket.status.toUpperCase()}</span>), issued for this project. The Master Terms Docket governs overarching service level agreements, legal boundaries, and liabilities, and shall take precedence in case of any operational discrepancies.
                        </div>
                    </div>
                ) : (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-3 max-w-4xl">
                        <div className="p-1 bg-[#C5A880]/10 rounded text-[#C5A880] shrink-0 mt-0.5">
                            <ShieldCheckIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <strong className="text-slate-800 font-bold block mb-1">Contractual Integration & Alignment Note</strong>
                            These Commercial Terms & Conditions are legally integrated with the Master Terms Docket once issued for this project. The Master Terms Docket serves as the overarching master service agreement and defines all legal, structural, and liability parameters.
                        </div>
                    </div>
                )}

                <div className="space-y-8 text-slate-700 text-xs leading-relaxed max-w-4xl">
                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="7d2f6696" ctl={edCtl}>1 · ENGAGEMENT MODEL AND BASIS OF VALUE</Ed></h4>
                        <EdList k="annex.1-engagement-model-and" ctl={edCtl} as="ol" className="list-decimal pl-4 space-y-1.5 text-slate-600">
                            <li>This engagement is a <strong className="text-[#0F172A]">single design-led turnkey engagement</strong>. FFDS contracts, procures, executes and supervises the scope listed in the proposal booklet, and carries contractual execution responsibility for that scope.</li>
                            <li>The figure stated in the booklet is the <strong className="text-[#0F172A]">Current Proposed Project Value</strong>, based on the scope, quantities and specifications presently recorded.</li>
                            <li>The <strong className="text-[#0F172A]">Final Turnkey Order Value</strong> will be issued after site validation, design freeze, Schedule of Finishes approval and final BOQ sign-off. Once accepted in writing, it becomes the contracted value for execution.</li>
                            <li><Ed k="324fa782" ctl={edCtl}>Rates underlying the proposal are held for the validity period stated above.</Ed></li>
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="f5dd5c3b" ctl={edCtl}>2 · COMMERCIAL SUMMARY</Ed></h4>
                        <table className="w-full text-left border-collapse border border-slate-200 text-slate-600">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                                    <th className="p-2">Component</th>
                                    <th className="p-2">Basis</th>
                                    <th className="p-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr>
                                    <td className="p-2"><Ed k="1c9dfb1a_2" ctl={edCtl}>Turnkey Execution Value</Ed></td>
                                    <td className="p-2"><Ed k="277d53ce_2" ctl={edCtl}>As listed scope</Ed></td>
                                    <td className="p-2 text-right font-mono">{formatINR(taxableExecution)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2"><Ed k="b7b78706_2" ctl={edCtl}>Design & Coordination Fee</Ed></td>
                                    <td className="p-2">{designFeeBasis}</td>
                                    <td className="p-2 text-right font-mono">{formatINR(taxableDesign)}</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold border-t border-slate-300">
                                    <td className="p-2"><Ed k="857af574_2" ctl={edCtl}>Net Taxable Value</Ed></td>
                                    <td className="p-2"></td>
                                    <td className="p-2 text-right font-mono">{formatINR(netTaxableValue)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2"><Ed k="a6bbe567_2" ctl={edCtl}>Applicable GST</Ed></td>
                                    <td className="p-2"><Ed k="a7652052" ctl={edCtl}>18% on FFDS invoiced value</Ed></td>
                                    <td className="p-2 text-right font-mono">{formatINR(gstOnDesign + chargedGstOnExecution)}</td>
                                </tr>
                                <tr className="bg-slate-900 text-white font-bold">
                                    <td className="p-2"><Ed k="b41f3f00" ctl={edCtl}>Total Proposed Project Investment</Ed></td>
                                    <td className="p-2"></td>
                                    <td className="p-2 text-right font-mono">{formatINR(totalProposedInvestment)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-[10px] text-slate-400 mt-2 italic"><Ed k="58ea405d" ctl={edCtl}>This is the only commercial summary; no other figure in any document supersedes it.</Ed></p>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="0f056cbb" ctl={edCtl}>3 · TAXES</Ed></h4>
                        <p><Ed k="5a972bbe" ctl={edCtl}>GST shall be applicable on amounts invoiced by Form Factors Design Studio at the prevailing statutory rate, currently 18%, on both the execution value and the design and coordination fee.</Ed></p>
                        <p className="mt-2"><Ed k="6277da00" ctl={edCtl}>Where a direct client purchase or a payment to a third-party supplier is specifically agreed and documented in writing, that item shall be invoiced separately by the respective supplier and falls outside the FFDS contracted value.</Ed></p>
                        <p className="mt-2"><Ed k="951a9977" ctl={edCtl}>Any change in statutory rates or the introduction of any new levy after the date of this proposal shall apply to invoices raised thereafter.</Ed></p>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="d794fc18" ctl={edCtl}>4 · PAYMENT TERMS</Ed></h4>
                        <EdList k="annex.4-payment-terms" ctl={edCtl} as="ol" className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li><Ed k="e5896545" ctl={edCtl}>All stage payments are payable in advance of the corresponding stage. Material orders are placed only against cleared funds.</Ed></li>
                            <li>Design fee shares are percentages of {formatINR(taxableDesign)}; execution shares are percentages of {formatINR(taxableExecution)}. Stage amounts are rounded to the nearest rupee, with Execution 1 carrying the rounding adjustment so that stages sum exactly to the net taxable value.</li>
                            <li><Ed k="7ed2b5a5" ctl={edCtl}>GST is added on each invoice at the prevailing rate.</Ed></li>
                            <li><Ed k="12eac516" ctl={edCtl}>The Project Initiation Fee of ₹4,999 is adjusted against the Design 1 invoice and is not additional to the total above.</Ed></li>
                            <li><Ed k="db32bcf7" ctl={edCtl}>Delays in approvals or payments will proportionately revise the project programme.</Ed></li>
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="73f70e57" ctl={edCtl}>5 · PROJECT INITIATION FEE</Ed></h4>
                        <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded p-4 bg-slate-50">
                            <div>
                                <strong className="text-slate-800 text-xs block mb-1">Covered by the fee</strong>
                                <EdList k="annex.5-project-initiation-fee" ctl={edCtl} as="ul" className="list-disc pl-4 text-slate-500">
                                    <li><Ed k="c7d19951" ctl={edCtl}>Site measurement</Ed></li>
                                    <li><Ed k="c944f2ce" ctl={edCtl}>Requirement documentation</Ed></li>
                                    <li><Ed k="a2587158" ctl={edCtl}>Preliminary scope validation</Ed></li>
                                </EdList>
                            </div>
                            <div>
                                <strong className="text-slate-800 text-xs block mb-1 font-bold">Not covered by the fee</strong>
                                <EdList k="annex.5-project-initiation-fee.2" ctl={edCtl} as="ul" className="list-disc pl-4 text-slate-400">
                                    <li><Ed k="dcaf0421" ctl={edCtl}>✕ Layouts and space planning</Ed></li>
                                    <li><Ed k="0a39764b" ctl={edCtl}>✕ 3D visualisation</Ed></li>
                                    <li><Ed k="ef057aa4" ctl={edCtl}>✕ GFC and joinery drawings</Ed></li>
                                    <li><Ed k="596fda86" ctl={edCtl}>✕ Schedule of Finishes</Ed></li>
                                    <li><Ed k="ea7bccb7" ctl={edCtl}>✕ Final BOQ</Ed></li>
                                </EdList>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="ec65632e" ctl={edCtl}>6 · SCOPE, QUANTITIES AND VARIATIONS</Ed></h4>
                        <EdList k="annex.6-scope-quantities-and" ctl={edCtl} as="ol" className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li><Ed k="d0bdccbc" ctl={edCtl}>Only items listed in the proposal booklet are included. Any item not written into the scope is not included.</Ed></li>
                            <li><Ed k="49611ff2" ctl={edCtl}>Quantities are as presently measured or estimated and are re-verified at site validation. Variation of more than 5% on any line will be notified in writing with the revised value before the affected work is ordered or commenced. Quantities are then adjusted to actual measured quantity at the rates underlying this proposal.</Ed></li>
                            <li><Ed k="f8a0f6fc" ctl={edCtl}>Any addition, deletion or specification change after design freeze will be quoted as a written variation and becomes payable with the next stage invoice once approved.</Ed></li>
                            <li><Ed k="844cdbdf" ctl={edCtl}>Items marked as actuals are billed at actual supplier cost against the client's approved selection and are not part of the fixed value. An indicative allowance for electrical fittings will be issued with the Schedule of Finishes for budgeting.</Ed></li>
                            {/*
                              This clause used to assert flatly that no carpentry
                              was priced, on every proposal — including ones whose
                              scope table carried nine lakh rupees of it. A clause
                              the client signs cannot contradict the priced scope
                              two pages earlier, so it now follows the BOQ.
                            */}
                            <li>{hasAnyCarpentryIncluded
                                ? <>Carpentry priced in this proposal is limited to the items listed in the scope of works. Any kitchen, wardrobe, bed, loft or bathroom carpentry not listed there is not priced. If required, {settings?.companyName || 'the studio'} will issue a priced addendum with quantities and specifications for approval, and the order value will be revised.</>
                                : <>Kitchen, wardrobes, beds, lofts and bathroom carpentry are not priced in this proposal. If required, {settings?.companyName || 'the studio'} will issue a priced addendum with quantities and specifications for approval, and the order value will be revised.</>
                            }</li>
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="beca6efc" ctl={edCtl}>7 · EXCLUSIONS</Ed></h4>

                        {/* Studio-only. `no-print` keeps it out of print, and the
                            PDF clone hides the same class, so a client never sees it. */}
                        {edCtl.on && scopeContradictions.length > 0 && (
                            <div className="no-print mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                                <span className="font-bold uppercase tracking-wider block mb-1">
                                    Check before sending — {scopeContradictions.length} exclusion{scopeContradictions.length > 1 ? 's' : ''} the BOQ may contradict
                                </span>
                                <ul className="space-y-0.5">
                                    {scopeContradictions.map(c => (
                                        <li key={c.key}>
                                            <span className="font-semibold">{c.label}</span> is listed as excluded, but the BOQ prices{' '}
                                            {c.evidence.map(e => `"${e}"`).join(', ')}.
                                        </li>
                                    ))}
                                </ul>
                                <span className="block mt-1 opacity-80">
                                    Edit the list below if the exclusion is wrong. This note is never shown to the client.
                                </span>
                            </div>
                        )}
                        {/*
                          One list, laid out in two columns by CSS rather than
                          split into two arrays. Splitting it meant adding an
                          exclusion to the left column could never rebalance
                          into the right, and the two halves were separately
                          overridable — so a studio edit could leave the section
                          half derived and half hand-written.

                          The ✕ is a CSS marker, not content: it must not end up
                          inside an editable run where it can be deleted or
                          duplicated.
                        */}
                        <EdList
                            k="annex.7-exclusions"
                            ctl={edCtl}
                            as="ul"
                            className="ff-x-list text-slate-500 text-[11px] space-y-1"
                        >
                            {[...annexureExclusionsList.col1, ...annexureExclusionsList.col2].map((exc, idx) => (
                                <li key={idx}>{exc}</li>
                            ))}
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="32cbf8a9" ctl={edCtl}>8 · PROGRAMME AND START CONDITIONS</Ed></h4>
                        <p><Ed k="annex.8-programme-intro" ctl={edCtl}>The site programme is {totalDays} working days, excluding Sundays and public holidays. Design and planning runs for approximately {designDays} working days before it and is not counted within it. The site programme is calculated from the date on which all four of the following are in place:</Ed></p>
                        <EdList k="annex.8-programme-and-start" ctl={edCtl} as="ul" className="list-disc pl-6 text-slate-600 mt-2">
                            <li><Ed k="234b3c76" ctl={edCtl}>Design and material selection freeze, with the Schedule of Finishes approved in writing</Ed></li>
                            <li><Ed k="8ce93c71" ctl={edCtl}>Receipt of the required stage payment</Ed></li>
                            <li><Ed k="eccf2fa5" ctl={edCtl}>Availability of the site for uninterrupted work, vacant and free of stored goods</Ed></li>
                            <li><Ed k="74529f93" ctl={edCtl}>Society permissions, work timings and lift or hoist access confirmed</Ed></li>
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="1ecb13b3" ctl={edCtl}>9 · ASSUMPTIONS AND CLIENT RESPONSIBILITIES</Ed></h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                            <div>
                                <span className="font-bold text-slate-800 block mb-1"><Ed k="8b593995" ctl={edCtl}>Assumptions</Ed></span>
                                <EdList k="annex.9-assumptions-and-client" ctl={edCtl} as="ul" className="list-disc pl-4 space-y-1 text-slate-500">
                                    <li><Ed k="290937c5" ctl={edCtl}>Single continuous mobilisation, flat vacant and available</Ed></li>
                                    <li><Ed k="3fd1e7c5" ctl={edCtl}>Existing walls, slab, flooring and plumbing sound and reusable as-is</Ed></li>
                                    <li><Ed k="1f030dd5" ctl={edCtl}>Existing distribution board adequate for the proposed load</Ed></li>
                                    <li><Ed k="bc0d9cf4" ctl={edCtl}>Normal society working hours, lift or hoist access available</Ed></li>
                                    <li><Ed k="9281477b" ctl={edCtl}>Water and power available at site for construction use</Ed></li>
                                    <li><Ed k="a515cc89" ctl={edCtl}>No structural alteration, waterproofing or slab work required</Ed></li>
                                </EdList>
                            </div>
                            <div>
                                <span className="font-bold text-slate-800 block mb-1"><Ed k="6f91b73a" ctl={edCtl}>Client responsibilities</Ed></span>
                                <EdList k="annex.9-assumptions-and-client.2" ctl={edCtl} as="ul" className="list-disc pl-4 space-y-1 text-slate-500">
                                    <li><Ed k="98841019" ctl={edCtl}>Timely approval of layouts, 3D views, samples and the Schedule of Finishes</Ed></li>
                                    <li><Ed k="fe404b04" ctl={edCtl}>Society intimation, permissions and any refundable deposits</Ed></li>
                                    <li><Ed k="8b9f6596" ctl={edCtl}>Statutory, municipal and society charges</Ed></li>
                                    <li><Ed k="3ac27417" ctl={edCtl}>Vacant possession of the flat for the execution period</Ed></li>
                                    <li><Ed k="bc982e1e" ctl={edCtl}>Selection of electrical fittings and appliances within the agreed window</Ed></li>
                                    <li><Ed k="bb5a4459" ctl={edCtl}>Stage payments in advance of each stage</Ed></li>
                                    <li><Ed k="454e9d53" ctl={edCtl}>Attendance at the joint snag inspection before handover</Ed></li>
                                </EdList>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="054a2193" ctl={edCtl}>10 · MATERIALS, SAMPLES AND WORKMANSHIP</Ed></h4>
                        <EdList k="annex.10-materials-samples-and" ctl={edCtl} as="ol" className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li><Ed k="012d8dd8" ctl={edCtl}>Final brands, shades and finishes are selected against physical samples during the Schedule of Finishes stage and recorded in writing.</Ed></li>
                            <li>Where a specified brand is unavailable, {settings?.companyName || 'FFDS'} will propose an equivalent of the same or higher grade for written approval before ordering. No substitution will be made without approval.</li>
                            <li><Ed k="03e3b121" ctl={edCtl}>Carpentry is built to approved GFC drawings. Exposed surfaces are laminated, edges banded and carcass interiors finished. Electrical points are tested and recorded before ceiling closure.</Ed></li>
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="c6725020" ctl={edCtl}>11 · HANDOVER, WARRANTY AND VALIDITY</Ed></h4>
                        <EdList k="annex.11-handover-warranty-and" ctl={edCtl} as="ol" className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li><Ed k="f5d39714" ctl={edCtl}>Handover follows closure of the joint snag list, deep cleaning of the worked areas, and release of the handover dossier and warranty note.</Ed></li>
                            <li>{settings?.companyName || 'FFDS'} provides a workmanship warranty of 6 months from handover on carpentry executed under this contract, covering manufacturing and installation defects.</li>
                            <li><Ed k="27cd97b9" ctl={edCtl}>Manufacturer warranties on hardware, laminates, paint and electrical fittings apply as issued by the respective brand.</Ed></li>
                            <li><Ed k="992a1058" ctl={edCtl}>Warranty excludes damage arising from misuse, water ingress, alteration by others and normal wear.</Ed></li>
                            <li>This proposal is valid for 15 days from {today} and supersedes all prior estimates, verbal indications and written communication on this project. Where any earlier document conflicts, the proposal booklet and this Annexure prevail.</li>
                            <li><Ed k="9dbf30b1" ctl={edCtl}>On confirmation, the turnkey agreement and the final BOQ together form the contract; the proposal booklet forms the basis of scope.</Ed></li>
                        </EdList>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2"><Ed k="1db9c1f6" ctl={edCtl}>12 · ACKNOWLEDGEMENT</Ed></h4>
                        <p><Ed k="d8bdaf37" ctl={edCtl}>The client acknowledges having read and accepted these Commercial Terms & Conditions together with the Design-led Turnkey Proposal booklet for the project named above.</Ed></p>
                        
                        <div className="grid grid-cols-2 gap-8 mt-6 pt-6 border-t border-slate-200">
                            <div>
                                <span className="text-[10px] text-slate-400 block font-bold">FOR {(settings?.companyName || 'FORM FACTORS DESIGN STUDIO').toUpperCase()}</span>
                                <div className="h-8 border-b border-slate-200 my-2"></div>
                                <span className="text-[8px] text-slate-400"><Ed k="300d015e" ctl={edCtl}>AUTHORISED SIGNATORY</Ed></span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 block font-bold"><Ed k="865936f7_2" ctl={edCtl}>ACCEPTED & APPROVED BY CLIENT</Ed></span>
                                <div className="h-8 border-b border-slate-200 my-2"></div>
                                <span className="text-[8px] text-slate-400">{projectContext.clientName?.toUpperCase() || 'CLIENT'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ================= MODAL: EDIT SPECIFICATIONS ================= */}
            {isEditingSpecs && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm no-print">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900"><Ed k="9dfb4049" ctl={edCtl}>Edit Material Specifications</Ed></h3>
                                <p className="text-xs text-slate-500"><Ed k="dd276d14" ctl={edCtl}>Update values to override dynamic specifications for this project.</Ed></p>
                            </div>
                            <button 
                                onClick={() => setIsEditingSpecs(false)}
                                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                            >
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {Object.keys(editedValues).map((category) => (
                                <div key={category} className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700 block">{category}</label>
                                    <textarea
                                        value={editedValues[category] || ''}
                                        onChange={(e) => setEditedValues(prev => ({ ...prev, [category]: e.target.value }))}
                                        rows={2}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A880]/50 focus:border-[#C5A880] bg-slate-50 hover:bg-slate-50/50 transition duration-150 resize-none"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditingSpecs(false)}
                                className="px-4 py-2 border border-slate-200 text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-100 transition duration-150"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveSpecs}
                                className="flex items-center gap-2 px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold rounded-lg transition duration-150 shadow-sm"
                            >
                                <Save className="w-3.5 h-3.5" />
                                Save Overrides
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ClientBookletProposal;

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from '@/lib/lucide-shim';
import { ProposalContent } from '../../types';
import '../projectHeader/projectHeader.css';

/*
  The pencil on each section of the Classic Digital proposal.

  This window used to print "Complex Data" for every section, because each
  section's text is an object (heading, description, cards, lists) and the
  renderer only knew how to show a plain value. It now walks the section and
  gives every piece of text its own field, including the lists inside it, so
  whatever the section holds can be changed without knowing its shape here.
*/

export const SECTION_LABELS: Record<string, string> = {
  cover: 'Cover & introduction',
  snapshot: 'Snapshot',
  process: 'Design process',
  fees: 'Fees',
  options: 'Options',
  timeline: 'Timeline',
  payments: 'Payment terms',
  cta: 'Next steps',
  l2_cover: 'Level 2 cover (approved option)',
  l2_cover_proposed: 'Level 2 cover (option not yet approved)',
  l2_snapshot: 'Level 2 snapshot',
  l2_fees: 'Level 2 commercial terms',
  l2_scope: 'Level 2 scope',
  l2_risk: 'Level 2 readiness',
  l2_finishes: 'Level 2 finishes',
  l2_timeline: 'Level 2 timeline',
  footer: 'Footer',
};

/* Parts of a section the classic proposal does not print, so editing them would change nothing. */
const HIDDEN_FIELDS: Record<string, string[]> = {
  process: ['steps'],
  cta: ['nextStepsTitle', 'steps'],
  l2_risk: ['items'],
};

const SECTION_NOTES: Record<string, string> = {
  l2_cover: 'Shown when the option this Level 2 proposal is for has been approved. [Tier Name] is filled in with the option\'s name.',
  l2_cover_proposed: 'Shown while the option this Level 2 proposal is for is not approved yet. [Tier Name] is filled in with the option\'s name.',
  process: 'The steps come from Studio settings. A process summary set there is shown in place of this description.',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Heading',
  subtitle: 'Description',
  text: 'Text',
  engagementModel: 'Engagement model',
  card1: 'Fee card',
  card2: 'Second card',
  label: 'Label',
  value: 'Fee',
  desc: 'Description',
  items: 'Points',
  practicalView: 'Note',
  nextStepsTitle: 'Next steps heading',
  steps: 'Steps',
  tags: 'Tags',
};

const ITEM_LABELS: Record<string, string> = { items: 'Point', steps: 'Step', tags: 'Tag' };

const labelFor = (key: string) =>
  FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50';
const fieldLabelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';

/** An empty item shaped like `sample`, for "Add" on a list. */
function blankLike(sample: any, list: any[]): any {
  if (typeof sample === 'string') return '';
  if (typeof sample === 'number') return 0;
  if (typeof sample === 'boolean') return false;
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object') {
    const out: Record<string, any> = {};
    Object.entries(sample).forEach(([k, v]) => {
      out[k] = k === 'id' && typeof v === 'number'
        ? Math.max(0, ...list.map(i => Number(i?.id) || 0)) + 1
        : blankLike(v, []);
    });
    return out;
  }
  return '';
}

interface FieldProps {
  name: string;
  label: string;
  value: any;
  onChange: (value: any) => void;
}

const Field: React.FC<FieldProps> = ({ name, label, value, onChange }) => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const long = value.length > 70 || value.includes('\n');
    return (
      <label className="block">
        <span className={label ? fieldLabelCls : 'sr-only'}>{label || labelFor(name)}</span>
        {long ? (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={Math.min(8, Math.max(3, Math.ceil(value.length / 80) + value.split('\n').length - 1))}
            className={`${inputCls} resize-y leading-relaxed`}
          />
        ) : (
          <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
        )}
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <label className="block">
        <span className={fieldLabelCls}>{label}</span>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={inputCls}
        />
      </label>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="accent-[#3D52A0]" />
        {label}
      </label>
    );
  }

  if (Array.isArray(value)) {
    const itemLabel = ITEM_LABELS[name] ?? 'Item';
    return (
      <div>
        <span className={fieldLabelCls}>{label}</span>
        <div className="space-y-2">
          {value.map((item, i) => (
            <div key={i} className="flex items-start gap-2 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
              <div className={`flex-1 min-w-0 ${typeof item === 'object' && item ? 'rounded-xl border border-slate-200 p-3 space-y-3' : ''}`}>
                <Field
                  name={name}
                  label={typeof item === 'object' && item ? `${itemLabel} ${i + 1}` : ''}
                  value={item}
                  onChange={v => onChange(value.map((old, j) => (j === i ? v : old)))}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                title={`Remove ${itemLabel.toLowerCase()}`}
                className="mt-1 p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-slate-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange([...value, blankLike(value[0] ?? '', value)])}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add {itemLabel.toLowerCase()}
        </button>
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = (Object.entries(value) as [string, any][]).filter(([k]) => k !== 'id');
    return (
      <div className="space-y-3">
        {label && <span className="block text-sm font-semibold text-slate-800">{label}</span>}
        {entries.map(([k, v]) => (
          <Field key={k} name={k} label={labelFor(k)} value={v} onChange={nv => onChange({ ...value, [k]: nv })} />
        ))}
      </div>
    );
  }

  return null;
};

interface Props {
  /** The section being edited, or null when the window is closed. */
  sectionId: string | null;
  content: ProposalContent;
  onClose: () => void;
  onSave: (content: ProposalContent) => void;
}

const ProposalSectionEditor: React.FC<Props> = ({ sectionId, content, onClose, onSave }) => {
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    if (!sectionId) return;
    const section = (content as any)?.[sectionId];
    setDraft(section && typeof section === 'object' ? JSON.parse(JSON.stringify(section)) : null);
    // Only when a section opens: a re-render of the proposal must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  useEffect(() => {
    if (!sectionId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sectionId, onClose]);

  if (!sectionId) return null;

  const hidden = HIDDEN_FIELDS[sectionId] ?? [];
  const shown: [string, any][] = draft ? Object.entries(draft as Record<string, any>).filter(([k]) => k !== 'id' && !hidden.includes(k)) : [];
  const note = SECTION_NOTES[sectionId];

  const save = () => {
    if (!draft) return onClose();
    onSave({ ...content, [sectionId]: draft });
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Edit ${SECTION_LABELS[sectionId] ?? sectionId}`}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Edit proposal section</p>
            <h3 className="font-bold text-slate-800 mt-1">{SECTION_LABELS[sectionId] ?? labelFor(sectionId)}</h3>
            <p className="text-xs text-slate-500 mt-1">Changes show in this proposal and in its PDF.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {note && <p className="text-[11px] text-slate-500 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">{note}</p>}
          {shown.length === 0 ? (
            <p className="text-xs text-slate-500">This section has no text to edit here.</p>
          ) : (
            shown.map(([k, v]) => (
              <Field key={k} name={k} label={labelFor(k)} value={v} onChange={nv => setDraft((d: any) => ({ ...d, [k]: nv }))} />
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} disabled={!draft} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50">Save section</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProposalSectionEditor;

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Item } from '../../types';
import { CustomBundle } from '../../hooks/useStudioSettings';
import { formatCurrency } from '../../lib/utils';
import { Button, Chip, EmptyState, PanelHead, INPUT, LABEL } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import { IconTile, EASE } from '../people/PeopleBits';
import BankModal from './BankModal';
import { PackageCheck, Plus, Search, X, Trash2, Edit2, Check, ChevronDown } from '@/lib/lucide-shim';

/*
  Item bank → Room kits (DESIGN.md "Item bank motion").

  A kit is a named set of items that go into a room together. This used to be
  drawn inside BankTab with eleven pieces of state of its own; it is its own
  screen now. It is given the kits and the bank, and hands back the whole list
  of kits whenever one changes (`onSave`), which the screen above stores.

  Two things did not work before and do now: the button that takes an item out
  of a kit was never visible, and a kit could only be made through an inline
  form that pushed the kits down the page. Making a kit is a window.
*/

interface Props {
  bank: Item[];
  kits: CustomBundle[];
  /** Stores the whole list. Resolves once it is saved. */
  onSave: (kits: CustomBundle[]) => Promise<void>;
}

const costOf = (i: Item) => (Number(i.materials) || 0) + (Number(i.labor) || 0);
const matches = (i: Item, q: string) => !q || (i.name || '').toLowerCase().includes(q) || (i.cat || '').toLowerCase().includes(q);

/* ── The window that makes a kit ────────────────────────────────────────── */

const CreateKitModal: React.FC<{ bank: Item[]; onClose: () => void; onCreate: (kit: CustomBundle) => Promise<void> }> = ({ bank, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    /* Ticked items first, so what is in the kit is always in view. */
    return bank.filter((i) => matches(i, needle)).sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id))).slice(0, 80);
  }, [bank, q, picked]);
  const total = useMemo(() => bank.filter((i) => picked.has(i.id)).reduce((s, i) => s + costOf(i), 0), [bank, picked]);
  const flip = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const ready = !!name.trim() && picked.size > 0;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await onCreate({ id: `custom-bundle-${Date.now()}`, name: name.trim(), description: desc.trim(), itemIds: Array.from(picked) });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BankModal
      label="Create a room kit"
      eyebrow="Room kits"
      title="Create a room kit"
      blurb="Name it, then tick the items that go into the room together."
      onClose={onClose}
      locked={saving}
      bodyClassName="p-2"
      tools={
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={`${LABEL} block mb-1.5`}>Name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Master bedroom" className={INPUT} />
            </label>
            <label className="block">
              <span className={`${LABEL} block mb-1.5`}>Description (optional)</span>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What the kit covers" className={INPUT} />
            </label>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an item" placeholder="Find an item or category" className={`${INPUT} pl-9`} />
          </div>
        </div>
      }
      footer={
        <>
          <span className="text-xs text-slate-500">
            <b className="font-bold text-slate-800 tabular-nums">{picked.size}</b> {picked.size === 1 ? 'item' : 'items'} ticked
            {picked.size > 0 && <> · base cost <b className="font-bold text-slate-800 tabular-nums">{formatCurrency(total)}</b></>}
          </span>
          <span className="flex items-center gap-2">
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" icon={Check} onClick={save} disabled={!ready || saving}
              title={!name.trim() ? 'Give the kit a name' : picked.size === 0 ? 'Tick at least one item' : undefined}>
              {saving ? 'Saving…' : 'Create kit'}
            </Button>
          </span>
        </>
      }
    >
      {shown.length === 0 && <p className="text-xs text-slate-500 p-4 text-center">No item matches.</p>}
      {shown.map((item) => {
        const on = picked.has(item.id);
        return (
          <button key={item.id} type="button" onClick={() => flip(item.id)} aria-pressed={on}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-slate-50">
            <span className={`w-5 h-5 rounded-md grid place-items-center border-2 shrink-0 transition-all ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white motion-safe:scale-105' : 'border-slate-300 text-transparent'}`}>
              <Check className="w-3 h-3" />
            </span>
            <span className="flex-1 min-w-0 leading-tight">
              <span className="block text-sm font-semibold text-slate-800 truncate">{item.name || 'Unnamed item'}</span>
              <span className="block text-[11px] text-slate-500 truncate">{item.cat || 'General'} · {item.unit}</span>
            </span>
            <span className="text-xs font-semibold text-slate-600 tabular-nums shrink-0">{formatCurrency(costOf(item))}</span>
          </button>
        );
      })}
      {bank.length > 80 && shown.length === 80 && <p className="text-[11px] text-slate-500 p-3 text-center">Showing the first 80. Search to find the rest.</p>}
    </BankModal>
  );
};

/* ── One kit ────────────────────────────────────────────────────────────── */

const KitCard: React.FC<{
  kit: CustomBundle;
  bank: Item[];
  index: number;
  still: boolean;
  onChange: (next: CustomBundle) => Promise<void>;
  onDelete: () => void;
}> = ({ kit, bank, index, still, onChange, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(kit.name);
  const [desc, setDesc] = useState(kit.description || '');
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [confirming, setConfirming] = useState(false);

  const byId = useMemo(() => new Map(bank.map((i) => [i.id, i] as [string, Item])), [bank]);
  /* In the order they were added. An item since deleted from the bank is simply not shown. */
  const items = kit.itemIds.map((id) => byId.get(id)).filter(Boolean) as Item[];
  const total = items.reduce((s, i) => s + costOf(i), 0);
  const candidates = useMemo(() => {
    if (!adding) return [];
    const needle = q.trim().toLowerCase();
    return bank.filter((i) => !kit.itemIds.includes(i.id) && matches(i, needle)).slice(0, 8);
  }, [adding, bank, kit.itemIds, q]);

  const saveName = async () => {
    if (!name.trim()) return;
    await onChange({ ...kit, name: name.trim(), description: desc.trim() });
    setEditing(false);
  };

  return (
    <article aria-label={kit.name}
      className="group bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 pp-lift hud-row-in transition-colors hover:border-[#3D52A0]/40"
      style={{ animationDelay: `${Math.min(index, 11) * 30}ms` }}>
      <div className="flex items-start gap-3">
        <IconTile icon={PackageCheck} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Kit name" className={INPUT}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
              <input value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Kit description" placeholder="What the kit covers" className={INPUT}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={saveName} disabled={!name.trim()}>Save</Button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="text-sm font-bold text-slate-800 truncate">{kit.name}</h4>
              {kit.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{kit.description}</p>}
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <Chip tone="brand">{items.length} {items.length === 1 ? 'item' : 'items'}</Chip>
                <span>Base cost <b className="font-bold text-slate-800 tabular-nums"><CountUp value={total} format={(v) => formatCurrency(Math.round(v))} /></b></span>
              </p>
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-0.5 -mr-1 -mt-1 shrink-0">
            <button type="button" onClick={() => { setName(kit.name); setDesc(kit.description || ''); setEditing(true); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-[#3D52A0]/10" title="Rename" aria-label={`Rename ${kit.name}`}>
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setConfirming(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete kit" aria-label={`Delete ${kit.name}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title={open ? 'Hide the items' : 'Show the items'} aria-label={`${open ? 'Hide' : 'Show'} the items in ${kit.name}`}>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Deleting asks here, on the card, where the kit is. */}
      {confirming && (
        <div className="hud-row-in flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2" role="alert">
          <span className="text-xs text-rose-800">Delete this kit? The items stay in the bank.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="quiet" onClick={() => setConfirming(false)}>Keep</Button>
            <Button size="sm" variant="danger" onClick={onDelete}>Delete kit</Button>
          </span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="items" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: still ? 0 : 0.24, ease: EASE }} className="overflow-hidden">
            {items.length === 0 ? (
              <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-300 px-3 py-3">Nothing in this kit yet.</p>
            ) : (
              <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="group/row flex items-center gap-2 pl-3 pr-1.5 py-1.5">
                    <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate" title={item.name}>{item.name || 'Unnamed item'}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{formatCurrency(costOf(item))}</span>
                    <button type="button" onClick={() => onChange({ ...kit, itemIds: kit.itemIds.filter((id) => id !== item.id) })}
                      className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 group-hover/row:text-slate-400 focus-visible:text-rose-600"
                      title="Take out of the kit" aria-label={`Take ${item.name} out of ${kit.name}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto">
        {adding ? (
          <div className="hud-row-in rounded-lg border border-[#3D52A0]/30 p-2 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Find an item to add to ${kit.name}`} placeholder="Find an item to add"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setQ(''); } }}
                className={`${INPUT} !py-1.5 !text-xs pl-8 pr-8`} />
              <button type="button" onClick={() => { setAdding(false); setQ(''); }} aria-label="Done adding"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {candidates.length === 0 && <li className="text-[11px] text-slate-500 px-1 py-1.5">No item matches.</li>}
              {candidates.map((item) => (
                <li key={item.id}>
                  {/* The picker stays open, so several items go in one after another. */}
                  <button type="button" onClick={() => onChange({ ...kit, itemIds: [...kit.itemIds, item.id] })}
                    className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left hover:bg-[#3D52A0]/10">
                    <Plus className="w-3.5 h-3.5 text-[#3D52A0] shrink-0" aria-hidden />
                    <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate">{item.name || 'Unnamed item'}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">{item.cat || 'General'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Button size="sm" variant="quiet" icon={Plus} onClick={() => { setAdding(true); setOpen(true); }}>Add an item</Button>
        )}
      </div>
    </article>
  );
};

/* ── The view ───────────────────────────────────────────────────────────── */

const BankRoomKits: React.FC<Props> = ({ bank, kits, onSave }) => {
  const [creating, setCreating] = useState(false);
  const still = !!useReducedMotion();

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <PanelHead
        icon={PackageCheck}
        title="Room kits"
        blurb="Items that go into a room together, so a whole room is added to a proposal in one click."
        aside={<Button size="sm" variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create kit</Button>}
      />

      {kits.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No room kits yet"
          text="Make one from items you pick here, or tick items in the list and choose Package to kit."
          action={<Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Create kit</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {kits.map((kit, i) => (
            <KitCard
              key={kit.id}
              kit={kit}
              bank={bank}
              index={i}
              still={still}
              onChange={(next) => onSave(kits.map((k) => (k.id === kit.id ? next : k)))}
              onDelete={() => onSave(kits.filter((k) => k.id !== kit.id))}
            />
          ))}
        </div>
      )}

      {creating && <CreateKitModal bank={bank} onClose={() => setCreating(false)} onCreate={(kit) => onSave([...kits, kit])} />}
    </section>
  );
};

export default BankRoomKits;

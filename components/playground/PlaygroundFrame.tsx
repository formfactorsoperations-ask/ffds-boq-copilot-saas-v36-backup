import React, { useMemo } from 'react';
import { LayoutGrid, Table2, Rows3, MapIcon, Sparkles, PaintRoller, Layers } from 'lucide-react';
import { Panel, Button, Chip, Segmented, SummaryStrip, LABEL } from '../ui/kit';
import { useSeesMargins } from '../ui/HideFigures';
import type { ProposalTier, Item, Room, BoqItem, ShareBasis } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { realRooms } from '../../lib/scopeBuckets';
import { pricingRulesOf, playgroundTotals, lineAmountsByRoom } from '../../lib/playground/pricing';
import { roomShares, planVsRule, byRoomQty } from '../../lib/playground/rooms';
import { boqFormatOf, BOQ_FORMAT_LABEL, wholeFlatCandidates, shareIntoRooms, unshare, paintingFromPlan } from '../../lib/playground/versions';

/*
  The BOQ Playground's frame (PR 3a), inside the BOQ Editor while the studio's
  BOQ Playground preview is on.

  The four modes become lenses on one BOQ: Sheet (the Excel grid), Rooms (the
  room workspace with its inspector, library and bundles, or the room cards)
  and Plan (the plan under the BOQ, with the takeoff). Above them: which kind
  of version this is, its totals as the client will be charged them, each
  room's share, and the whole-flat services shared into the rooms.

  A Classic BOQ (any version made before the Playground) is shown and edited
  as it is, at exact amounts; "Make a Playground version" copies it into the
  next version, priced by the Playground's rules.
*/

export type Lens = 'sheet' | 'rooms' | 'plan';
export type RoomsView = 'workspace' | 'cards';

const BASIS_LABEL: Record<ShareBasis, string> = {
  wallPaint: 'Walls, from the plan', ceilingPaint: 'Ceilings, from the plan', paint: 'Walls and ceilings',
  falseCeiling: 'False ceiling area', points: 'Points by room', carpetArea: 'Floor area',
};
const UNIT_OF: Partial<Record<ShareBasis, string>> = { points: 'points' };

interface FrameProps {
  tier: ProposalTier;
  rooms: Room[];
  bankMap: Map<string, Item>;
  lens: Lens;
  onLens: (l: Lens) => void;
  roomsView: RoomsView;
  onRoomsView: (v: RoomsView) => void;
  currentRoles?: any;
  locked: boolean;
  onMakePlaygroundVersion?: () => void;
}

/** The header: version, the client's figures, the lenses. */
export function PlaygroundHeader({ tier, rooms, bankMap, lens, onLens, roomsView, onRoomsView, currentRoles, locked, onMakePlaygroundVersion }: FrameProps) {
  const seesMargins = useSeesMargins(currentRoles);
  const format = boqFormatOf(tier);
  const rules = pricingRulesOf(tier);
  const totals = useMemo(() => playgroundTotals(tier.boq || [], bankMap, { rules, rooms }), [tier.boq, bankMap, rules, rooms]);
  const real = realRooms(rooms);
  const onPlan = real.filter(r => r.plan).length;
  const margin = totals.sell > 0 ? ((totals.sell - totals.cost) / totals.sell) * 100 : 0;

  return (
    <div className="space-y-4 mb-6">
      <Panel
        icon={Sparkles}
        title="BOQ Playground"
        badge={<><Chip tone={format === 'playground' ? 'brand' : 'slate'}>{BOQ_FORMAT_LABEL[format]}</Chip><Chip tone="slate">{tier.name}</Chip></>}
        blurb={format === 'playground'
          ? 'Every client amount is rounded up to the nearest ₹100, line by line. Cost is untouched.'
          : 'A Classic BOQ: exact amounts, as it has always been priced. Make a Playground version to work on it here.'}
        aside={format === 'classic' && !locked && onMakePlaygroundVersion
          ? <Button size="sm" variant="primary" icon={Sparkles} onClick={onMakePlaygroundVersion}>Make a Playground version</Button>
          : undefined}
      >
        <SummaryStrip stats={[
          { label: 'The work', value: formatCurrency(Math.round(totals.sell)), sub: format === 'playground' ? 'Rounded up to ₹100 a line' : 'Exact amounts' },
          { label: 'Lines', value: String(totals.itemCount), sub: `${(tier.boq || []).filter(l => l.byRoom).length} shared across the flat` },
          { label: 'Rooms on the plan', value: `${onPlan} of ${real.length}`, sub: onPlan ? 'Measured lines follow them' : 'No plan on this project yet', tone: onPlan === real.length && real.length ? 'good' : 'warn' },
          ...(seesMargins ? [{ label: 'Margin', value: `${margin.toFixed(1)}%`, sub: `Cost ${formatCurrency(Math.round(totals.cost))}` }] : []),
        ]} />
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Lens>
          label="Lens on the BOQ"
          value={lens}
          onChange={onLens}
          options={[
            { id: 'sheet', label: <><Table2 className="w-4 h-4" aria-hidden />Sheet</> },
            { id: 'rooms', label: <><Rows3 className="w-4 h-4" aria-hidden />Rooms</> },
            { id: 'plan', label: <><MapIcon className="w-4 h-4" aria-hidden />Plan</> },
          ]}
        />
        {lens === 'rooms' && (
          <Segmented<RoomsView>
            label="How the rooms are shown"
            size="sm"
            value={roomsView}
            onChange={onRoomsView}
            options={[
              { id: 'workspace', label: <><Layers className="w-3.5 h-3.5" aria-hidden />Workspace</> },
              { id: 'cards', label: <><LayoutGrid className="w-3.5 h-3.5" aria-hidden />Cards</> },
            ]}
          />
        )}
      </div>
    </div>
  );
}

/** Each room's share of the work, as the client will be charged it. */
export function RoomTotals({ tier, rooms, bankMap }: Pick<FrameProps, 'tier' | 'rooms' | 'bankMap'>) {
  const rules = pricingRulesOf(tier);
  const byRoom = useMemo(() => playgroundTotals(tier.boq || [], bankMap, { rules, rooms }).byRoom, [tier.boq, bankMap, rules, rooms]);
  const rows = Array.from(byRoom.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  return (
    <div className="mb-6">
      <span className={`${LABEL} block mb-1.5`}>By room</span>
      <div className="flex flex-wrap gap-2">
        {rows.map(([room, v], i) => (
          <span key={room} className="rounded-xl border border-slate-200 bg-white px-3 py-2 hud-row-in" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="block text-xs text-slate-500">{room}</span>
            <span className="block text-sm font-black text-slate-800 tabular-nums">{formatCurrency(Math.round(v))}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface AcrossProps {
  tier: ProposalTier;
  rooms: Room[];
  bank: Item[];
  bankMap: Map<string, Item>;
  locked: boolean;
  onReplaceLine: (id: string, next: BoqItem) => void;
  onAddLines: (lines: BoqItem[]) => void;
  newId: () => string;
}

/**
 * Whole-flat services shared into the rooms: one line each, every room's
 * share, measured from the plan or typed, adding up to the line.
 */
export function AcrossTheFlat({ tier, rooms, bank, bankMap, locked, onReplaceLine, onAddLines, newId }: AcrossProps) {
  const real = useMemo(() => realRooms(rooms), [rooms]);
  const rules = pricingRulesOf(tier);
  const shared = (tier.boq || []).filter(l => l.byRoom);
  const candidates = wholeFlatCandidates(tier.boq || [], bankMap);
  const hasPainting = shared.some(l => l.byRoom!.basis === 'wallPaint') && shared.some(l => l.byRoom!.basis === 'ceilingPaint');
  const canPaint = !hasPainting && real.length > 0 && !!paintingFromPlan(bank, real, () => 'probe');

  const setRoom = (line: BoqItem, room: string, patch: { on?: boolean; qty?: number | undefined }) => {
    const rs = { ...(line.byRoom!.rooms || {}) };
    const cur = { ...(rs[room] || {}), ...patch };
    if (cur.qty === undefined) delete cur.qty;
    rs[room] = cur;
    const byRoom = { ...line.byRoom!, rooms: rs };
    onReplaceLine(line.id, withQty({ ...line, byRoom }, real));
  };
  const setRule = (line: BoqItem, rule: boolean) => {
    const byRoom = { ...line.byRoom!, rule: rule || undefined };
    if (!rule) delete (byRoom as any).rule;
    onReplaceLine(line.id, withQty({ ...line, byRoom }, real));
  };

  if (!shared.length && !candidates.length && !canPaint) return null;

  return (
    <Panel
      icon={PaintRoller}
      title="Across the flat"
      blurb="Painting, false ceiling and electrical as one line each, shared room by room. The shares add up to the line."
      className="mb-6"
      aside={canPaint && !locked ? (
        <Button size="sm" icon={PaintRoller} onClick={() => { const p = paintingFromPlan(bank, real, newId); if (p) onAddLines(p.lines); }}>
          Add painting from the plan
        </Button>
      ) : undefined}
    >
      <div className="space-y-4">
        {shared.map(line => {
          const item = bankMap.get(line.bankId);
          const basis = line.byRoom!.basis;
          const shares = roomShares(line.byRoom!, real);
          const amounts = lineAmountsByRoom(line, bankMap, { rules, rooms: real });
          const paint = basis === 'wallPaint' || basis === 'ceilingPaint';
          const ruleTotal = paint ? real.reduce((a, r) => a + (shares.get(r.name) ? planVsRule(basis as 'wallPaint' | 'ceilingPaint', r).rule : 0), 0) : 0;
          return (
            <div key={line.id} className="rounded-xl border border-slate-200 hud-row-in">
              <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-800">{item?.name || line.name || 'Line'}</span>
                <Chip tone="brand">{BASIS_LABEL[basis]}</Chip>
                <span className="text-xs text-slate-500 tabular-nums">{line.qty} {UNIT_OF[basis] || item?.unit || ''}</span>
                <span className="ml-auto flex items-center gap-1">
                  {paint && !locked && (
                    <Segmented<'plan' | 'rule'>
                      label={`How ${item?.name || 'this line'} is measured`}
                      size="sm"
                      value={line.byRoom!.rule ? 'rule' : 'plan'}
                      onChange={v => setRule(line, v === 'rule')}
                      options={[{ id: 'plan', label: 'From the plan' }, { id: 'rule', label: `Carpet-area rule · ${Math.round(ruleTotal)}` }]}
                    />
                  )}
                  {!locked && <Button size="sm" variant="quiet" onClick={() => onReplaceLine(line.id, unshare(line))}>One figure for the flat</Button>}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {real.map(r => {
                  const s = line.byRoom!.rooms?.[r.name] || {};
                  const q = shares.get(r.name) || 0;
                  const off = q === 0 && s.on === false;
                  return (
                    <div key={r.name} className="px-4 py-2 flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-2 flex-1 min-w-0">
                        <input type="checkbox" checked={q > 0 || s.on === true} disabled={locked}
                          onChange={e => setRoom(line, r.name, { on: e.target.checked })}
                          aria-label={`${r.name} takes a share of ${item?.name || 'this line'}`} />
                        <span className={`truncate ${off || q === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{r.name}</span>
                      </label>
                      <input
                        type="number" min={0} step={1} disabled={locked || q === 0 && s.on !== true}
                        className="w-24 px-2 py-1 rounded-lg border border-slate-300 text-xs text-right tabular-nums disabled:bg-slate-50"
                        value={Math.round(q * 100) / 100}
                        onChange={e => setRoom(line, r.name, { qty: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                        aria-label={`${r.name}: ${item?.name || 'share'}`}
                      />
                      <span className="w-24 text-right font-semibold text-slate-800 tabular-nums">{formatCurrency(Math.round(amounts.get(r.name) || 0))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {candidates.length > 0 && !locked && (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3">
            <p className="text-xs text-slate-500 mb-2">Priced for the whole flat. Share into rooms so each room carries its part:</p>
            <div className="flex flex-wrap gap-2">
              {candidates.map(({ line, basis }) => (
                <Button key={line.id} size="sm" onClick={() => onReplaceLine(line.id, { ...shareIntoRooms(line, basis, real), roomId: line.roomId || 'Whole flat' })}>
                  Share {bankMap.get(line.bankId)?.name || 'line'} into rooms
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** The line with its quantity brought in line with its shares. */
const withQty = (line: BoqItem, rooms: Room[]): BoqItem => ({ ...line, qty: byRoomQty(line.byRoom!, rooms) });

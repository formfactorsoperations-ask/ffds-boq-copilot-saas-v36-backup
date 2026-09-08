import { calculateSellPrice } from './utils';

/**
 * The scope, as the client is allowed to see it.
 *
 * A BOQ line carries two different things: what the work is, and what it cost
 * the studio to arrive at the price. `bankId`, `materials`, `labor`,
 * `baseRate`, `marginOverride` are the second kind — they are how the sell rate
 * was reached, and handing them to a client hands over the margin.
 *
 * This derivation used to live inside a useMemo in ClientPortal, where it could
 * only run when the whole project was in memory: tiers, the item bank, the
 * revision log. A signed-in client has none of those — they read a stored
 * projection — so the scope tab was simply empty for them. Extracted here so
 * the studio's preview and the client's copy come from one function, and what
 * ops previews is exactly what gets stored.
 *
 * Every field below is one the portal actually renders. Nothing is carried "in
 * case".
 */
export interface ClientBoqRow {
  id: string;
  /** Room or section this line is grouped under. */
  roomId: string;
  room?: string;
  roomName?: string;
  /** What the work is. */
  item: string;
  /** Trade or category. */
  cat: string;
  unit: string;
  qty: number;
  /** Sell rate — what the client is charged, never the cost it was built from. */
  rate: number;
  total: number;
  description?: string;
  /*
    What the line covers and what it does not.

    Contractual, not internal: the execution agreement defines the BOQ as
    including "quantities, unit rates, item descriptions, inclusions,
    exclusions, allowances, and as-actuals". A client agreeing to a line is
    agreeing to its boundaries, so withholding them would leave them approving
    a price without its scope.
  */
  inclusions?: string[];
  exclusions?: string[];
  /** Approved | Added | Revised | Removed */
  status: string;
  /*
    Where this line came from, kept separately from `status`.

    The two were conflated and it misled people. `status` is the commercial
    state — approved, pending — and once a revision is approved into a new BOQ
    version every line reads "Approved", which is true and tells the client
    nothing. A line that was added last week and a line that has been in the
    contract since day one looked identical.

    Set only by the comparison against the previous approved version. A pending
    revision is not a change to the client's scope yet — the studio can still
    discard it — so marking one would tell a client their contract had moved
    when it had not. Markers appear when a revision is approved into a new BOQ
    version, and not before.
  */
  change?: {
    type: 'added' | 'revised' | 'replaced' | 'removed';
    /** RevisionAction.timestamp — when the studio made the change. */
    at?: number;
    note?: string;
    /** What it was before, when the log recorded it. */
    from?: { qty?: number; rate?: number };
  };
}

/**
 * Inclusions and exclusions are typed as string[] but reach us from templates,
 * imports and hand-editing, where a comma-separated string is just as likely.
 * Both are accepted; blanks are dropped; an empty result becomes undefined so
 * the projection carries no key at all rather than an empty array.
 */
function toClauseList(value: any): string[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const cleaned = raw.map(v => String(v).trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

interface BuildParams {
  /** The operative BOQ for the tier the client is on. */
  boq: any[];
  /** Item bank, for lines that resolve their name and rate from it. */
  bank: any[];
  rooms?: { name?: string }[];
  /** context.boqRevisions — additions, removals and quantity changes. */
  revisions?: any[];
  /*
    The same rows built from the BOQ the client originally approved — the root
    of the tier.parentTierId chain, not just the version this one supersedes.

    This is where provenance actually comes from. `boqRevisions` is emptied when
    a revision is approved into a new BOQ version, so by the time the client
    sees anything there is no log left to read — every line arrives looking like
    it had always been there. The versions survive, and comparing the current
    one against the original says plainly which lines are new and which moved.

    Against the original rather than the immediate parent, so markers accumulate
    across annexures instead of each approval erasing the last one's.

    Compared on quantity and rate only. Names change between versions for
    reasons that are not changes to the deal — the parent called a line "Base
    cabinets (carcass)" and the approved version calls the same line "CABINETS
    BELOW COUNTER (TANDEM)" — and diffing those would mark the entire BOQ
    revised.
  */
  previous?: ClientBoqRow[];
}

/**
 * Flatten a project's BOQ into client-safe rows, with revisions applied.
 *
 * Removed lines are kept with `status: 'Removed'` and a zero quantity rather
 * than dropped, so a client comparing against an earlier version can see that
 * something went away instead of wondering whether they misremembered.
 */
export function buildClientBoqRows({ boq, bank, rooms, revisions, previous }: BuildParams): ClientBoqRow[] {
  const validRoomNames = new Set((rooms || []).map(r => r?.name).filter(Boolean) as string[]);
  const bankMap = new Map<string, any>((bank || []).map(b => [b.id, b]));

  const baseline: ClientBoqRow[] = (boq || []).map((item: any, idx: number) => {
    const bankItem = bankMap.get(item.bankId);

    const itemTitle = item.item || item.name || bankItem?.name || 'Deliverable Item';
    const itemCat = item.cat || item.category || bankItem?.cat || 'General Scope';
    const itemUnit = item.unit || bankItem?.unit || 'nos';
    const itemSpecs = item.description || item.specs || item.rationale || bankItem?.specs || '';
    const itemQty = item.qty !== undefined ? item.qty : 1;

    /*
      The sell rate, by the same order of preference the portal has always
      used. calculateSellPrice is the last resort and the only branch that
      touches materials, labour and margin — and only to produce the single
      number the client is charged. None of its inputs leave this function.
    */
    let sellPrice = 0;
    if (item.rate !== undefined && Number(item.rate) > 0) {
      sellPrice = Number(item.rate);
    } else if (item.selectedRate !== undefined && Number(item.selectedRate) > 0) {
      sellPrice = Number(item.selectedRate);
    } else if (item.sellPrice !== undefined && Number(item.sellPrice) > 0) {
      sellPrice = Number(item.sellPrice);
    } else if (bankItem) {
      const materials = item.materials ?? item.baseRate ?? bankItem.materials;
      const labor = item.labor ?? bankItem.labor;
      const margin = item.marginOverride ?? item.margin ?? bankItem.margin;
      sellPrice = calculateSellPrice(materials, labor, margin);
    } else if (item.total && itemQty > 0) {
      sellPrice = Number(item.total) / itemQty;
    }

    const totalVal = item.total !== undefined ? Number(item.total) : sellPrice * itemQty;

    const groupKey =
      item.roomId && validRoomNames.has(item.roomId)
        ? item.roomId
        : item.roomId || (validRoomNames.has(itemCat) ? itemCat : 'General Scope');

    return {
      id: item.id || `boq-item-${item.bankId || 'item'}-${idx}`,
      roomId: groupKey,
      room: item.room,
      roomName: item.roomName,
      item: itemTitle,
      cat: itemCat,
      unit: itemUnit,
      qty: itemQty,
      rate: sellPrice,
      total: totalVal,
      description: itemSpecs,
      inclusions: toClauseList(item.inclusions ?? (bankItem as any)?.inclusions),
      exclusions: toClauseList(item.exclusions ?? (bankItem as any)?.exclusions),
      status: item.status || 'Approved',
    };
  });

  const working: ClientBoqRow[] = JSON.parse(JSON.stringify(baseline));

  /*
    Apply the revision log, and record what each action did.

    Two separate jobs, deliberately. Applying changes the numbers and is limited
    to the three action types this has always handled — starting to apply
    REVISE_RATE here would silently move money. Recording is safe for every
    type, and it is what lets the client see that a line was touched even after
    the revision has been approved and folded into a new BOQ version.
  */
  (revisions || []).forEach((action: any) => {
    const matches = (row: ClientBoqRow) =>
      action.targetId ? row.id === action.targetId : row.roomId === action.section && row.item === action.item;

    if (action.type === 'ADD') {
      /*
        Only add it if it is not already there.

        Once a revision is approved the added line becomes part of the operative
        BOQ, while the log entry that created it remains. Pushing unconditionally
        put the item in the client's BOQ twice — and, since every line carries a
        total, billed it twice. Marking the existing row instead keeps the
        provenance without the duplicate.
      */
      const existing = working.find(r => r.id === action.id || matches(r));
      if (existing) return;

      working.push({
        id: action.id,
        roomId: action.section,
        item: action.item,
        /* Not action.section: that is already the room, and using it as the
           trade too would put every added line into its own category in the
           trade filter. The original derivation left this unset and the UI
           fell back to 'General Scope'; this keeps that behaviour explicit. */
        cat: 'General Scope',
        unit: action.newValue?.unit || 'nos',
        qty: action.newValue?.qty || 1,
        rate: action.newValue?.rate || 0,
        total: (action.newValue?.qty || 1) * (action.newValue?.rate || 0),
        status: 'Added',
        description: action.note,
      });
      return;
    }

    const target = working.find(matches);
    if (!target) return;

    if (action.type === 'REMOVE') {
      target.status = 'Removed';
      target.qty = 0;
      target.total = 0;
      return;
    }

    if (action.type === 'REVISE_QTY') {
      target.qty = action.newValue;
      target.total = action.newValue * target.rate;
      target.status = 'Revised';
      return;
    }

    /*
      REVISE_RATE and REPLACE are deliberately not applied. The rate and the
      substituted item already sit in the operative BOQ once the revision is
      approved; re-applying them from the log would either be a no-op or, if the
      log and the BOQ disagree, would quietly overwrite the contract with the log.
    */
  });

  /*
    Provenance against the previous version, for anything the log did not
    already account for. An unapplied revision is the more current fact, so a
    marker already set above is left alone.
  */
  if (previous?.length) {
    const before = new Map(previous.map(r => [r.id, r]));
    const near = (a: number, b: number) => Math.abs((a || 0) - (b || 0)) < 0.01;

    working.forEach(row => {
      if (row.change) return;

      const was = before.get(row.id);
      if (!was) {
        row.change = { type: 'added' };
        return;
      }

      const qtyMoved = !near(row.qty, was.qty);
      const rateMoved = !near(row.rate, was.rate);
      if (!qtyMoved && !rateMoved) return;

      row.change = {
        type: 'revised',
        from: {
          qty: qtyMoved ? was.qty : undefined,
          rate: rateMoved ? was.rate : undefined,
        },
      };
    });

    /*
      Lines that were in the previous version and are not in this one.

      Dropping them silently is the worst of the options: the client compared
      two documents, found a line gone, and had no way to tell a deletion from
      their own misreading. They are carried through at zero — so they cost
      nothing and change no subtotal — and shown struck through as removed.
    */
    const now = new Set(working.map(r => r.id));
    previous.forEach(was => {
      if (now.has(was.id)) return;
      working.push({
        ...was,
        qty: 0,
        total: 0,
        status: 'Removed',
        change: { type: 'removed', from: { qty: was.qty, rate: was.rate } },
      });
    });
  }

  return working;
}

/**
 * Rebuild the original BOQ from rows that already carry their own history.
 *
 * Needed because the versions themselves do not survive: a project's `tiers`
 * array has been seen dropping from four entries to one, leaving `parentTierId`
 * pointing at a version that no longer exists. After that there is nothing left
 * to diff against.
 *
 * But a marked row states what it used to be — `change.from` holds the figure
 * before it moved, and an added row says it was not there at all. That is
 * enough to reconstruct the baseline they were measured against, so history
 * survives in the only place that outlives the tier list: the rows themselves.
 *
 * Seeding a baseline from sent rows *without* unwinding them is what made every
 * marker vanish: the rows already contain the changes, so comparing the current
 * scope against them found no differences at all.
 */
export function baselineFromSentRows(rows: ClientBoqRow[] | undefined): ClientBoqRow[] | undefined {
  if (!rows?.length) return undefined;

  const original: ClientBoqRow[] = [];
  rows.forEach(row => {
    // Added after the baseline: it was not in the original at all.
    if (row.change?.type === 'added') return;

    const from = row.change?.from;
    if (!from) {
      original.push({ ...row, change: undefined });
      return;
    }

    const qty = from.qty !== undefined ? from.qty : row.qty;
    const rate = from.rate !== undefined ? from.rate : row.rate;
    original.push({
      ...row,
      qty,
      rate,
      total: qty * rate,
      // A removed line was live in the original, so it is restored as such.
      status: row.change?.type === 'removed' ? 'Approved' : row.status,
      change: undefined,
    });
  });

  return original.length ? original : undefined;
}

/**
 * Group rows for display.
 *
 * A line removed by a *pending* revision is dropped — it is still part of the
 * client's scope until the revision is approved. A line removed by an approved
 * version is kept, marked, so the client can see what went.
 */
export function groupClientBoq(rows: ClientBoqRow[]): Record<string, ClientBoqRow[]> {
  const grouped: Record<string, ClientBoqRow[]> = {};
  (rows || []).forEach(row => {
    if (row.status === 'Removed' && row.qty === 0 && row.change?.type !== 'removed') return;
    const key = row.roomId || 'General Scope';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });
  return grouped;
}

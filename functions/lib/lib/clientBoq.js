"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupClientBoq = exports.baselineFromSentRows = exports.buildClientBoqRows = void 0;
const utils_1 = require("./utils");
/**
 * Inclusions and exclusions are typed as string[] but reach us from templates,
 * imports and hand-editing, where a comma-separated string is just as likely.
 * Both are accepted; blanks are dropped; an empty result becomes undefined so
 * the projection carries no key at all rather than an empty array.
 */
function toClauseList(value) {
    const raw = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];
    const cleaned = raw.map(v => String(v).trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
}
/**
 * Flatten a project's BOQ into client-safe rows, with revisions applied.
 *
 * Removed lines are kept with `status: 'Removed'` and a zero quantity rather
 * than dropped, so a client comparing against an earlier version can see that
 * something went away instead of wondering whether they misremembered.
 */
function buildClientBoqRows({ boq, bank, rooms, revisions, previous }) {
    const validRoomNames = new Set((rooms || []).map(r => r === null || r === void 0 ? void 0 : r.name).filter(Boolean));
    const bankMap = new Map((bank || []).map(b => [b.id, b]));
    const baseline = (boq || []).map((item, idx) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const bankItem = bankMap.get(item.bankId);
        const itemTitle = item.item || item.name || (bankItem === null || bankItem === void 0 ? void 0 : bankItem.name) || 'Deliverable Item';
        const itemCat = item.cat || item.category || (bankItem === null || bankItem === void 0 ? void 0 : bankItem.cat) || 'General Scope';
        const itemUnit = item.unit || (bankItem === null || bankItem === void 0 ? void 0 : bankItem.unit) || 'nos';
        const itemSpecs = item.description || item.specs || item.rationale || (bankItem === null || bankItem === void 0 ? void 0 : bankItem.specs) || '';
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
        }
        else if (item.selectedRate !== undefined && Number(item.selectedRate) > 0) {
            sellPrice = Number(item.selectedRate);
        }
        else if (item.sellPrice !== undefined && Number(item.sellPrice) > 0) {
            sellPrice = Number(item.sellPrice);
        }
        else if (bankItem) {
            const materials = (_b = (_a = item.materials) !== null && _a !== void 0 ? _a : item.baseRate) !== null && _b !== void 0 ? _b : bankItem.materials;
            const labor = (_c = item.labor) !== null && _c !== void 0 ? _c : bankItem.labor;
            const margin = (_e = (_d = item.marginOverride) !== null && _d !== void 0 ? _d : item.margin) !== null && _e !== void 0 ? _e : bankItem.margin;
            sellPrice = (0, utils_1.calculateSellPrice)(materials, labor, margin);
        }
        else if (item.total && itemQty > 0) {
            sellPrice = Number(item.total) / itemQty;
        }
        const totalVal = item.total !== undefined ? Number(item.total) : sellPrice * itemQty;
        const groupKey = item.roomId && validRoomNames.has(item.roomId)
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
            inclusions: toClauseList((_f = item.inclusions) !== null && _f !== void 0 ? _f : bankItem === null || bankItem === void 0 ? void 0 : bankItem.inclusions),
            exclusions: toClauseList((_g = item.exclusions) !== null && _g !== void 0 ? _g : bankItem === null || bankItem === void 0 ? void 0 : bankItem.exclusions),
            status: item.status || 'Approved',
        };
    });
    const working = JSON.parse(JSON.stringify(baseline));
    /*
      Apply the revision log, and record what each action did.
  
      Two separate jobs, deliberately. Applying changes the numbers and is limited
      to the three action types this has always handled — starting to apply
      REVISE_RATE here would silently move money. Recording is safe for every
      type, and it is what lets the client see that a line was touched even after
      the revision has been approved and folded into a new BOQ version.
    */
    (revisions || []).forEach((action) => {
        var _a, _b, _c, _d, _e;
        const matches = (row) => action.targetId ? row.id === action.targetId : row.roomId === action.section && row.item === action.item;
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
            if (existing)
                return;
            working.push({
                id: action.id,
                roomId: action.section,
                item: action.item,
                /* Not action.section: that is already the room, and using it as the
                   trade too would put every added line into its own category in the
                   trade filter. The original derivation left this unset and the UI
                   fell back to 'General Scope'; this keeps that behaviour explicit. */
                cat: 'General Scope',
                unit: ((_a = action.newValue) === null || _a === void 0 ? void 0 : _a.unit) || 'nos',
                qty: ((_b = action.newValue) === null || _b === void 0 ? void 0 : _b.qty) || 1,
                rate: ((_c = action.newValue) === null || _c === void 0 ? void 0 : _c.rate) || 0,
                total: (((_d = action.newValue) === null || _d === void 0 ? void 0 : _d.qty) || 1) * (((_e = action.newValue) === null || _e === void 0 ? void 0 : _e.rate) || 0),
                status: 'Added',
                description: action.note,
            });
            return;
        }
        const target = working.find(matches);
        if (!target)
            return;
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
    if (previous === null || previous === void 0 ? void 0 : previous.length) {
        const before = new Map(previous.map(r => [r.id, r]));
        const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.01;
        working.forEach(row => {
            if (row.change)
                return;
            const was = before.get(row.id);
            if (!was) {
                row.change = { type: 'added' };
                return;
            }
            const qtyMoved = !near(row.qty, was.qty);
            const rateMoved = !near(row.rate, was.rate);
            if (!qtyMoved && !rateMoved)
                return;
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
            if (now.has(was.id))
                return;
            working.push(Object.assign(Object.assign({}, was), { qty: 0, total: 0, status: 'Removed', change: { type: 'removed', from: { qty: was.qty, rate: was.rate } } }));
        });
    }
    return working;
}
exports.buildClientBoqRows = buildClientBoqRows;
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
function baselineFromSentRows(rows) {
    if (!(rows === null || rows === void 0 ? void 0 : rows.length))
        return undefined;
    const original = [];
    rows.forEach(row => {
        var _a, _b, _c;
        // Added after the baseline: it was not in the original at all.
        if (((_a = row.change) === null || _a === void 0 ? void 0 : _a.type) === 'added')
            return;
        const from = (_b = row.change) === null || _b === void 0 ? void 0 : _b.from;
        if (!from) {
            original.push(Object.assign(Object.assign({}, row), { change: undefined }));
            return;
        }
        const qty = from.qty !== undefined ? from.qty : row.qty;
        const rate = from.rate !== undefined ? from.rate : row.rate;
        original.push(Object.assign(Object.assign({}, row), { qty,
            rate, total: qty * rate, 
            // A removed line was live in the original, so it is restored as such.
            status: ((_c = row.change) === null || _c === void 0 ? void 0 : _c.type) === 'removed' ? 'Approved' : row.status, change: undefined }));
    });
    return original.length ? original : undefined;
}
exports.baselineFromSentRows = baselineFromSentRows;
/**
 * Group rows for display.
 *
 * A line removed by a *pending* revision is dropped — it is still part of the
 * client's scope until the revision is approved. A line removed by an approved
 * version is kept, marked, so the client can see what went.
 */
function groupClientBoq(rows) {
    const grouped = {};
    (rows || []).forEach(row => {
        var _a;
        if (row.status === 'Removed' && row.qty === 0 && ((_a = row.change) === null || _a === void 0 ? void 0 : _a.type) !== 'removed')
            return;
        const key = row.roomId || 'General Scope';
        if (!grouped[key])
            grouped[key] = [];
        grouped[key].push(row);
    });
    return grouped;
}
exports.groupClientBoq = groupClientBoq;
//# sourceMappingURL=clientBoq.js.map
// BOQ Version Difference Engine

export interface DiffResult {
    added: any[];
    removed: any[];
    modified: any[];
    unchanged: any[];
    statusChanges: any[];
    totals: {
        grandTotalDelta: number;
        firmTotalDelta: number;
        estimateExposureDelta: number;
        roomDeltas: any[];
    };
    changeOrders: string[];
}

export function diffBoqVersions(snapshotA: any, snapshotB: any): DiffResult {
    const aItems = snapshotA?.itemsSnapshot || [];
    const bItems = snapshotB?.itemsSnapshot || [];
    
    const aMap = new Map(aItems.map((i: any) => [i.id || i.itemId, i]));
    const bMap = new Map(bItems.map((i: any) => [i.id || i.itemId, i]));

    const added: any[] = [];
    const removed: any[] = [];
    const modified: any[] = [];
    const unchanged: any[] = [];
    const statusChanges: any[] = [];
    const changeOrdersSet = new Set<string>();

    // Detect added and modified
    for (const rawB of bItems) {
        const b = rawB as any;
        const id = b.id || b.itemId;
        const a: any = aMap.get(id);

        if (!a) {
            added.push(b);
            if (b.changeOrderRef) changeOrdersSet.add(b.changeOrderRef);
        } else {
            // Check for modifications
            const changes: any[] = [];
            
            // Fields to check
            const fields = [
                { key: 'qty', label: 'Quantity' },
                { key: 'unitCost', label: 'Unit Cost' },
                { key: 'marginPct', label: 'Margin %' },
                { key: 'boqStatus', label: 'Status' },
                { key: 'description', label: 'Description' },
                { key: 'roomId', label: 'Room' },
                { key: 'unit', label: 'Unit' }
            ];

            // Also check sub-properties like linkage.label
            if (a.linkage?.label !== b.linkage?.label) {
                changes.push({ field: 'Linkage Label', from: a.linkage?.label, to: b.linkage?.label });
            }

            for (const f of fields) {
                if (a[f.key] !== b[f.key]) {
                    changes.push({ field: f.key, from: a[f.key], to: b[f.key] });
                    if (f.key === 'boqStatus') {
                        statusChanges.push({ itemId: id, from: a.boqStatus, to: b.boqStatus, changeOrderRef: b.changeOrderRef });
                    }
                }
            }

            // Check if status went to deleted
            if (a.boqStatus !== 'deleted' && b.boqStatus === 'deleted') {
                 removed.push(a); // logically removed
                 if (b.changeOrderRef) changeOrdersSet.add(b.changeOrderRef);
                 continue; // don't also add to modified
            }
            if (a.boqStatus === 'deleted' && b.boqStatus !== 'deleted') {
                 added.push(b); // restored
                 if (b.changeOrderRef) changeOrdersSet.add(b.changeOrderRef);
                 continue;
            }

            if (changes.length > 0 && b.boqStatus !== 'deleted') {
                modified.push({
                    itemId: id,
                    description: b.description || a.description,
                    itemA: a,
                    itemB: b,
                    changes,
                    roomId: b.roomId || a.roomId
                });
                if (b.changeOrderRef) changeOrdersSet.add(b.changeOrderRef);
            } else if (b.boqStatus !== 'deleted') {
                unchanged.push(b);
            }
        }
    }

    // Detect strictly removed
    for (const a of aItems) {
        const id = a.id || a.itemId;
        const b = bMap.get(id);
        if (!b) {
            removed.push(a);
        }
    }

    // Deltas
    const aTotals = snapshotA?.totalsSnapshot || { grandTotal: 0, firmTotal: 0, estimateExposure: 0, roomTotals: {} };
    const bTotals = snapshotB?.totalsSnapshot || { grandTotal: 0, firmTotal: 0, estimateExposure: 0, roomTotals: {} };

    const grandTotalDelta = (bTotals.grandTotal || 0) - (aTotals.grandTotal || 0);
    const firmTotalDelta = (bTotals.firmTotal || 0) - (aTotals.firmTotal || 0);
    const estimateExposureDelta = (bTotals.estimateExposure || 0) - (aTotals.estimateExposure || 0);

    const roomDeltas: any[] = [];
    const allRoomIds = new Set([...Object.keys(aTotals.roomTotals || {}), ...Object.keys(bTotals.roomTotals || {})]);
    for (const rid of allRoomIds) {
        const aVal = aTotals.roomTotals?.[rid]?.total || 0;
        const bVal = bTotals.roomTotals?.[rid]?.total || 0;
        if (aVal !== bVal) {
            roomDeltas.push({
                roomId: rid,
                roomName: aTotals.roomTotals?.[rid]?.name || bTotals.roomTotals?.[rid]?.name || rid,
                delta: bVal - aVal
            });
        }
    }

    return {
        added,
        removed,
        modified,
        unchanged,
        statusChanges,
        totals: {
            grandTotalDelta,
            firmTotalDelta,
            estimateExposureDelta,
            roomDeltas
        },
        changeOrders: Array.from(changeOrdersSet).filter(Boolean)
    };
}

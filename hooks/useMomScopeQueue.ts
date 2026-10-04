import { useCallback, useEffect, useState } from 'react';
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import type { MOM, MOMActionItem, MOMScopeRequest } from '../types';

/*
  COST AND SCOPE ITEMS FROM MEETINGS, WAITING FOR A SCOPE REVISION.

  A meeting is where scope moves ("add a loft above the master wardrobe"), but
  until now the minutes and the scope lived apart: the MoM flagged the item and
  nothing carried it anywhere. Finalising minutes now queues every action that
  changes cost or scope (MOMActionItem.scopeRequest), and the revision screens
  read the queue from here.

  The queue lives on the minutes, not in the project context, on purpose: the
  minutes can be finalised from several screens that do not hold the project
  context, and a context written from the wrong screen is overwritten by the
  workspace that has it open. Adding an item to a revision is done by the
  revision screen, which owns the context; this only records where it went.
*/

export interface MomScopeItem {
  key: string;
  momId: string;
  momRef: string;
  momRev: number;
  meetingTitle: string;
  meetingDate: number;
  actionId: string;
  /** "A-02", as the minutes number it. */
  ref: string;
  text: string;
  owner: string;
  dueDate?: number | null;
  cost: boolean;
  scope: boolean;
  queuedAt?: number | null;
}

const ownerOf = (a: MOMActionItem) =>
  String(a.ownerName || '').trim() ||
  (a.owner === 'ffds' ? 'Studio' : a.owner === 'client' ? 'Client' : a.owner === 'vendor' ? 'Vendor' : '');

export function useMomScopeQueue(studioId?: string | null, projectId?: string | null) {
  const [items, setItems] = useState<MomScopeItem[]>([]);

  useEffect(() => {
    if (!studioId || !projectId || !db) { setItems([]); return; }
    const unsub = onSnapshot(
      collection(db, `organizations/${studioId}/projects/${projectId}/moms`),
      (snap) => {
        const out: MomScopeItem[] = [];
        snap.forEach((d) => {
          const m = d.data() as MOM;
          (m.actionItems || []).forEach((a, i) => {
            if (a?.scopeRequest?.status !== 'queued') return;
            out.push({
              key: `${d.id}:${a.id}`,
              momId: d.id,
              momRef: m.momRef,
              momRev: Number(m.rev || 0),
              meetingTitle: m.meetingTitle || 'Meeting',
              meetingDate: Number(m.meetingDate || 0),
              actionId: a.id,
              ref: `A-${String(i + 1).padStart(2, '0')}`,
              text: a.text,
              owner: ownerOf(a),
              dueDate: a.dueDate ?? null,
              cost: !!a.flags?.cost,
              scope: !!a.flags?.scope,
              queuedAt: a.scopeRequest.queuedAt ?? null,
            });
          });
        });
        out.sort((x, y) => x.meetingDate - y.meetingDate || x.ref.localeCompare(y.ref));
        setItems(out);
      },
      (err) => console.warn('MoM scope queue:', err),
    );
    return () => unsub();
  }, [studioId, projectId]);

  /* Read-modify-write in a transaction: the action tracker writes the same
     array, and a revision of the minutes may be holding a copy of it. */
  const settle = useCallback(async (item: MomScopeItem, patch: Partial<MOMScopeRequest>) => {
    if (!studioId || !projectId) throw new Error('No project');
    const ref = doc(db, `organizations/${studioId}/projects/${projectId}/moms`, item.momId);
    const clean = JSON.parse(JSON.stringify(patch));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const m = snap.data() as MOM;
      const apply = (list?: MOMActionItem[]) =>
        (list || []).map((a) => (a.id === item.actionId ? { ...a, scopeRequest: { ...(a.scopeRequest || { status: 'queued' }), ...clean } } : a));
      const changes: Record<string, any> = { actionItems: apply(m.actionItems) };
      if (m.pendingRevision?.actionItems) changes['pendingRevision.actionItems'] = apply(m.pendingRevision.actionItems as MOMActionItem[]);
      tx.update(ref, changes);
    });
  }, [studioId, projectId]);

  const markAdded = useCallback(
    (item: MomScopeItem, addedTo: string, extra?: { revisionId?: string; lineId?: string }) =>
      settle(item, { status: 'added', addedAt: Date.now(), addedTo, ...(extra || {}) }),
    [settle],
  );
  const dismiss = useCallback(
    (item: MomScopeItem, by?: string | null) => settle(item, { status: 'dismissed', dismissedAt: Date.now(), dismissedBy: by || null }),
    [settle],
  );

  return { items, markAdded, dismiss };
}

/** Queues every cost or scope action that has not been queued before. */
export function queueScopeActions(actions: MOMActionItem[] | undefined, by?: string | null): MOMActionItem[] {
  const now = Date.now();
  return (actions || []).map((a) =>
    (a.flags?.scope || a.flags?.cost) && !a.scopeRequest && String(a.text || '').trim()
      ? { ...a, scopeRequest: { status: 'queued' as const, queuedAt: now, queuedBy: by || null } }
      : a,
  );
}

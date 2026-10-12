import { useMemo } from 'react';
import type { FullProjectData } from '../../types';
import { getSingleProjectValue } from '../../lib/financialsUtils';
import { seesStudioFinance } from '../../lib/roleAccess';
import { isHidden, type AttentionState } from '../../services/attentionState';

/*
  NEEDS YOUR ATTENTION: the studio's worklist (useStudioHomeData), grouped by
  project, because a project is the thing you act on. Home pins it on "Your
  day, in order" (components/home/HomeWidgets.tsx → AttentionWidget).

  Each row carries the project's worst flag, its money (finance roles only,
  lib/roleAccess) and how long it has sat. Snoozed and dismissed projects
  leave before anything is ranked, so the counts agree with what is on
  screen. Worst flag first; within a flag, value weighted by how long it has
  sat, so a quarter-million stuck two months outranks a larger job raised
  today.
*/

export interface AttentionRow {
  project: FullProjectData;
  actions: any[];
  value: number;
  worst: 'blocker' | 'due' | 'suggested';
  /** Days since anyone touched the project. */
  idle: number;
}

const RANK: Record<string, number> = { blocker: 0, due: 1, suggested: 2 };

export function useAttentionRows(
  worklist: Array<{ project: FullProjectData; action: any }>, attention: AttentionState, role: string | string[],
): AttentionRow[] {
  return useMemo(() => {
    const now = Date.now();
    const money = seesStudioFinance(role);
    const map = new Map<string, AttentionRow>();
    for (const w of worklist) {
      const id = w.project.id;
      if (!map.has(id)) {
        map.set(id, {
          project: w.project,
          actions: [],
          value: money ? getSingleProjectValue(w.project) || 0 : 0,
          worst: w.action.priority,
          idle: w.project.lastModified ? Math.max(0, Math.floor((now - w.project.lastModified) / 86400000)) : 0,
        });
      }
      const row = map.get(id)!;
      row.actions.push(w.action);
      if (RANK[w.action.priority] < RANK[row.worst]) row.worst = w.action.priority;
    }
    const rows = [...map.values()].filter((r) => !isHidden(attention[r.project.id], r.project.lastModified));
    const heat = (r: AttentionRow) => r.value * (1 + Math.min(r.idle, 90) / 30);
    return rows.sort((a, b) => RANK[a.worst] - RANK[b.worst] || heat(b) - heat(a));
  }, [worklist, attention, role]);
}

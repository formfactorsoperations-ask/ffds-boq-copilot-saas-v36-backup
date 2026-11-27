import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db as fsDb } from '../../services/firebaseClient';
import { db as storageDb } from '../../services/dbService';
import { drawingModel } from '../../lib/projectHome';
import { computeSchedule as computeProgramme } from '../../lib/schedule';
import { scheduleForEngagement } from '../../lib/scheduleBuilder';

/*
  What the project card's At a glance and Timeline read (the Conversations
  workspace), from the same records and the same models the Hub uses
  (components/projectHome/ProjectHome): the Drawing Tracker
  (lib/projectHome drawingModel) and the saved programme (lib/schedule).
  A record this person may not read is left out quietly.
*/

export interface Glance {
  /** Null while it loads. */
  drawings: { total: number; issued: number; approved: number } | null;
  /** The programme's forecast handover and the target, when a programme is saved. */
  handoverISO: string | null;
  targetISO: string | null;
  /** The next few dates on the programme, soonest first. */
  milestones: Array<{ id: string; title: string; startISO: string }>;
  /** Whether a programme is saved at all (undefined while it loads). */
  hasProgramme: boolean | undefined;
}

export function useProjectGlance(projectId: string, studioId: string, ctx: any): Glance {
  const [drawItems, setDrawItems] = useState<any[] | null>(null);
  const [saved, setSaved] = useState<any | null | undefined>(undefined);

  useEffect(() => {
    setDrawItems(null);
    if (!fsDb || !projectId || !studioId) { setDrawItems([]); return; }
    return onSnapshot(collection(fsDb, `organizations/${studioId}/projects/${projectId}/drawingTracker`),
      (s) => setDrawItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setDrawItems([]));
  }, [projectId, studioId]);

  useEffect(() => {
    let alive = true;
    setSaved(undefined);
    if (!projectId) return;
    storageDb.getSchedule(projectId).then((s: any) => alive && setSaved(s || null)).catch(() => alive && setSaved(null));
    return () => { alive = false; };
  }, [projectId]);

  const roomNames = useMemo(() => (ctx?.rooms || []).map((r: any) => r.name), [ctx?.rooms]);
  const drawings = useMemo(() => {
    if (!drawItems) return null;
    try {
      const m: any = drawingModel(drawItems as any, roomNames);
      return { total: m.total || 0, issued: m.issued || 0, approved: m.approved || 0 };
    } catch { return { total: 0, issued: 0, approved: 0 }; }
  }, [drawItems, roomNames]);

  const programme = useMemo(() => {
    if (!saved) return { handoverISO: null, targetISO: null, milestones: [] as Glance['milestones'] };
    try {
      const schedule: any = scheduleForEngagement(saved, ctx) || saved;
      const r: any = computeProgramme(schedule);
      const today = new Date().toISOString().slice(0, 10);
      const milestones = (r.tasks || [])
        .map((t: any) => ({ id: String(t.id), title: String(t.title || ''), startISO: String(t.plannedStartISO || t.startISO || ''), status: t.status }))
        .filter((t: any) => t.startISO && t.status !== 'completed' && t.startISO >= today)
        .sort((a: any, b: any) => a.startISO.localeCompare(b.startISO))
        .slice(0, 4)
        .map(({ id, title, startISO }: any) => ({ id, title, startISO }));
      return { handoverISO: r.finishISO || null, targetISO: schedule.targetHandoverISO || null, milestones };
    } catch { return { handoverISO: null, targetISO: null, milestones: [] as Glance['milestones'] }; }
  }, [saved, ctx]);

  return { drawings, ...programme, hasProgramme: saved === undefined ? undefined : !!saved };
}

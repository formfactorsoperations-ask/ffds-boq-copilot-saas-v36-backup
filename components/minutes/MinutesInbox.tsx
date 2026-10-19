import React, { useEffect, useState } from 'react';
import { FileText, Plus, Loader2, Check } from '@/lib/lucide-shim';
import { useOrg } from '../../contexts/OrgContext';
import { primaryRole } from '../../lib/roles';
import { waitingFromMinutes, type Outbox } from '../../lib/minutes';
import { projectMinutes, markFiled } from '../../services/minutesService';

/*
  FROM THE MINUTES, WAITING TO BE ADDED (mockup 10).

  Requirements from a discovery meeting belong in the brief; selections from
  a material selection meeting belong in Materials. Once minutes are
  approved, what they hold waits here, on the screen it belongs to, until
  someone adds it with one press. Each item is then marked added on the
  minutes, so it is never offered twice. Nothing is copied by hand.
*/

export default function MinutesInbox({ projectId, kind, title, action, onAdd }: {
  projectId?: string | null;
  kind: keyof Outbox;
  title: string;
  /** "Add to the brief" */
  action: string;
  /** Put the items where they belong; resolves once done. */
  onAdd: (items: { ref: string; item: any }[]) => void | Promise<void>;
}) {
  const { orgData, currentUserAuth, currentRole, currentRoles, teamMembers } = useOrg() as any;
  const studioId: string = orgData?.tenantId || '';
  const [waiting, setWaiting] = useState<ReturnType<typeof waitingFromMinutes>>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () => {
    if (!projectId || !studioId) return;
    projectMinutes(studioId, projectId).then((m) => setWaiting(waitingFromMinutes(m, kind))).catch(() => setWaiting([]));
  };
  useEffect(load, [projectId, studioId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!waiting.length) return done ? <p className="text-xs text-emerald-700 inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{done}</p> : null;

  const add = async () => {
    setBusy(true);
    try {
      await onAdd(waiting.map((w) => ({ ref: w.ref, item: w.item })));
      const email = String(currentUserAuth?.email || '').toLowerCase();
      const name = ((orgData?.team || teamMembers || []) as any[]).find((t) => String(t?.email || '').toLowerCase() === email)?.name || email;
      const me = { email, name, role: primaryRole(currentRoles?.length ? currentRoles : [currentRole]) || null };
      const byMom = new Map<string, string[]>();
      for (const w of waiting) byMom.set(w.momId, [...(byMom.get(w.momId) || []), w.item.lineId]);
      for (const [momId, ids] of byMom) await markFiled(studioId, String(projectId), momId, ids, me, title);
      setDone(`${waiting.length} added.`);
      setWaiting([]);
    } catch (e) {
      console.error(e);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#3D52A0]/30 bg-[#3D52A0]/5 px-4 py-3 hud-panel-in">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="w-4 h-4 text-[#3D52A0] shrink-0" />
        <p className="text-sm font-bold text-slate-800 flex-1 min-w-[200px]">{waiting.length} {title} from the minutes</p>
        <button type="button" onClick={add} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486] disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}{action}
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {waiting.slice(0, 8).map((w) => (
          <li key={`${w.momId}:${w.item.lineId}`} className="text-xs text-slate-700">
            <b className="font-semibold text-slate-800">{w.item.room ? `${w.item.room}: ` : ''}</b>{w.item.item ? `${w.item.item}: ` : ''}{w.item.text}
            <span className="text-slate-500"> · {w.ref}</span>
          </li>
        ))}
        {waiting.length > 8 && <li className="text-[11px] text-slate-500">and {waiting.length - 8} more</li>}
      </ul>
    </div>
  );
}

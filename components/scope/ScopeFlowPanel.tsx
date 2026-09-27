import React, { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { ProjectContext } from '../../types';

/**
 * SIGNED SCOPE — the switch, for projects that started before it.
 *
 * New projects start with signed scope on and never see this. On an older
 * project the Revision Studio works as before until the studio switches it on
 * here; from then on the Scope Revision screen replaces the Workbench and
 * Approve & Sync. A live client project asks first, and offers a rehearsal
 * copy to try it on.
 */

interface Props {
  projectContext: ProjectContext;
  setProjectContext: (fn: (prev: ProjectContext) => ProjectContext) => void;
  onMakeRehearsalCopy?: () => Promise<string | null>;
  currentUser: string;
}

export default function ScopeFlowPanel({ projectContext: ctx, setProjectContext, onMakeRehearsalCopy, currentUser }: Props) {
  const isReal = !ctx.isDummy && ctx.projectCategory !== 'dummy';
  const [confirmOn, setConfirmOn] = useState(false);
  const [copying, setCopying] = useState<'idle' | 'busy' | string>('idle');
  const [error, setError] = useState<string | null>(null);

  const switchOn = () => {
    setProjectContext(prev => ({ ...prev, scopeFlow: { enabled: true, enabledAt: Date.now(), enabledBy: currentUser } }));
    setConfirmOn(false);
  };
  const makeCopy = async () => {
    if (!onMakeRehearsalCopy) return;
    setCopying('busy');
    setError(null);
    try {
      setCopying((await onMakeRehearsalCopy()) || 'idle');
    } catch (e: any) {
      setCopying('idle');
      setError(`The copy could not be saved: ${e?.message || e}`);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs px-5 sm:px-6 py-5">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Signed scope</div>
          <h3 className="text-[22px] font-bold tracking-tight text-slate-900 mt-0.5">This project started before signed scope</h3>
          <p className="text-[13px] text-slate-600 mt-1 max-w-2xl">
            Its BOQ changes the old way — the Workbench and Approve & Sync. Switch on to move it over: the approved version is recorded as the signed Detailed BOQ, its rates are frozen, and from then on every change is a Scope Revision the client signs.
          </p>
          {ctx.rehearsalOf && <p className="text-[12px] text-amber-800 mt-2">Rehearsal copy of {ctx.rehearsalOf.projectName} — nothing here reaches the client.</p>}
        </div>
        <div className="flex md:flex-col items-center md:items-end gap-2 shrink-0">
          <button
            role="switch"
            aria-checked={false}
            onClick={() => (isReal ? setConfirmOn(true) : switchOn())}
            className="flex items-center gap-2 text-[13px] font-bold text-slate-700 cursor-pointer group"
          >
            <span className="w-10 h-6 rounded-full bg-slate-200 group-hover:bg-slate-300 relative transition-colors"><span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow" /></span>
            Off
          </button>
          {isReal && !ctx.rehearsalOf && onMakeRehearsalCopy && (
            <button onClick={makeCopy} disabled={copying === 'busy'} className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" /> {copying === 'busy' ? 'Copying…' : 'Make a rehearsal copy first'}
            </button>
          )}
        </div>
      </div>

      {copying !== 'idle' && copying !== 'busy' && (
        <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[12.5px] text-emerald-900 flex items-center gap-2">
          <Check className="w-4 h-4" /> Saved “{copying}” as a dummy project, with no client email, phone or portal access. Open it from Projects to rehearse.
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-[12.5px] text-rose-900">{error}</div>}

      {confirmOn && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[12.5px] text-amber-950 space-y-2">
          <div className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><div><b>This is a live client project.</b> Switching on changes nothing the client can see, but the next steps freeze the approved BOQ's rates and replace the Workbench and Approve & Sync. Rehearse on a copy first if you have not.</div></div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmOn(false)} className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-slate-600 hover:bg-amber-100 cursor-pointer">Cancel</button>
            <button onClick={switchOn} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-bold cursor-pointer">Switch on for this project</button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-emerald-50/60 border border-emerald-200/70 px-3.5 py-2.5 text-[12px] text-emerald-900">
        New projects start with signed scope on. This switch only appears on projects created before it.
      </div>
    </div>
  );
}

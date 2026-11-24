import React, { Suspense } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { canSetAudience } from '../../lib/drawingReview';
import DesignDeskTab from '../drawingReview/DesignDeskTab';
import { btnClass } from './parts';

/*
  WHICH DESIGN DESK the studio sees on the Design Desk tab.

  Today's desk (components/drawingReview) stays the default. A studio's senior
  roles can switch the whole studio to Design Desk 2.0 and back with one
  button, so the new desk can be tried on real drawings and left again without
  a deploy. The choice is one field on the studio's record (designDesk); both
  desks read the same drawings, so nothing is moved or converted either way.
*/

const DeskTwo = React.lazy(() => import('./DeskTwo'));

interface Props {
  projects: any[];
  activeProjectId?: string | null;
}

export default function DesignDeskSwitch(props: Props) {
  const { orgData, updateOrgData, currentRole, currentRoles } = useOrg();
  const role: string[] = currentRoles?.length ? currentRoles : [String(currentRole || '')];
  /* The same roles that decide who a drawing is for: Design Head, Owner, Admin, Ops Director. */
  const canSwitch = canSetAudience(role);

  if (orgData?.designDesk === 'new') {
    return (
      <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>}>
        <DeskTwo {...props} onUseClassic={canSwitch ? () => updateOrgData({ designDesk: 'classic' }) : undefined} />
      </Suspense>
    );
  }
  return (
    <>
      {canSwitch && (
        <div className="hud-panel-in mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><Sparkles size={18} aria-hidden /></span>
          <span className="min-w-0 flex-[1_1_280px]">
            <span className="block text-sm font-bold text-slate-800">The new Design Desk is ready to try</span>
            <span className="block text-xs text-slate-600">It uses the same drawings, notes and meetings. Switching changes the screens for everyone in the studio, and you can switch back at any time.</span>
          </span>
          <button type="button" className={btnClass('primary')} onClick={() => updateOrgData({ designDesk: 'new' })}>Switch the studio to the new desk</button>
        </div>
      )}
      <DesignDeskTab {...props} />
    </>
  );
}

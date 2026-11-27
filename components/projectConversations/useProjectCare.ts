import { useEffect, useState } from 'react';
import { loadProjectOps } from '../../services/opsDeskService';
import { loadDigests } from '../../services/digestService';
import { watchMeetings } from '../../services/designMeetingService';
import type { CareRecords } from '../../lib/projectCare';
import type { Digest } from '../../lib/fridayDigest';
import type { DesignMeeting } from '../../lib/designMeeting';

/*
  What the smart workspace's PR 2 cards read (lib/projectCare), for one
  project, from the records the Ops Desk and the Design Desk already keep:

    - the project's client care (follow-ups, escalations, decisions, minutes,
      visits, checklists), as the Ops Desk loads it, for the client pulse and
      handover readiness: only for those who may open the Ops Desk;
    - this week's update to the client (lib/fridayDigest), the same people;
    - the project's design meetings, for revision rounds still to bill or
      waive: only for those who bill them.

  A record this person may not read is left out quietly, and its card does
  not show.
*/

export interface ProjectCare {
  /** Null while it loads, or for a role that does not see client care. */
  care: CareRecords | null;
  /** This week's update; null when there is none; undefined while it loads or for a role that does not see it. */
  digest: Digest | null | undefined;
  /** Null for a role that does not bill rounds. */
  meetings: DesignMeeting[] | null;
}

export function useProjectCare(i: { projectId: string; tenantId: string; name: string; seesCare: boolean; canBill: boolean; week: string }): ProjectCare {
  const [care, setCare] = useState<CareRecords | null>(null);
  const [digest, setDigest] = useState<Digest | null | undefined>(undefined);
  const [meetings, setMeetings] = useState<DesignMeeting[] | null>(null);

  useEffect(() => {
    let live = true;
    setCare(null); setDigest(undefined);
    if (!i.seesCare || !i.tenantId || !i.projectId) return;
    loadProjectOps(i.tenantId, { id: i.projectId, name: i.name })
      .then((r) => { if (live) setCare(r as unknown as CareRecords); })
      .catch(() => { if (live) setCare(null); });
    loadDigests([i.projectId], i.week)
      .then((m) => { if (live) setDigest(m[i.projectId] || null); })
      .catch(() => { if (live) setDigest(undefined); });
    return () => { live = false; };
  }, [i.projectId, i.tenantId, i.seesCare, i.week]);

  useEffect(() => {
    setMeetings(null);
    if (!i.canBill || !i.tenantId || !i.projectId) return;
    return watchMeetings(i.tenantId, i.projectId, setMeetings, () => setMeetings(null));
  }, [i.projectId, i.tenantId, i.canBill]);

  return { care, digest, meetings };
}

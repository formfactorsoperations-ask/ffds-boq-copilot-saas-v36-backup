import { useEffect, useMemo, useState } from 'react';
import { useOrg } from '../../contexts/OrgContext';
import { mayOpenStudioTab } from '../../lib/roleAccess';
import { canReview } from '../../lib/drawingReview';
import type { Viewer } from '../../lib/designDesk';
import { upcoming, type Upcoming } from '../../lib/homeWidgets';
import { businessDate } from '../../lib/peopleDesk';
import { watchProjectDrawings, watchStudioReviews, type ReviewDrawing } from '../../services/drawingReviewService';
import { loadVisits } from '../../services/opsDeskService';

/*
  What Home reads live, once, for the story deck and the widgets alike: the
  Design Desk's sheets this person may see, and the meetings and visits
  booked with clients on their live projects. Who may see what follows
  their roles (lib/roleAccess, lib/drawingReview).
*/

export interface HomeFeeds {
  who: string | string[];
  orgId: string;
  email: string;
  /** Opens the Design Desk. */
  desk: boolean;
  /** Reviews sheets (Design Head, Owner, Admin). */
  reviewer: boolean;
  /** Is on People. */
  people: boolean;
  /** Sees meetings and visits booked with clients. */
  visitsOn: boolean;
  viewer: Viewer;
  rows: ReviewDrawing[] | null;
  visits: Upcoming[] | null;
  names: Map<string, string>;
}

/* Projects still being worked on: not finished, lost or archived. */
const LIVE = (p: any) => p?.id && !['completed', 'lost', 'archived'].includes(String(p?.context?.status || ''));

/** The Design Desk's sheets this person may see: the studio's for reviewers, their projects' for everyone else. */
function useDeskRows(orgId: string, reviewer: boolean, projectIds: string[], on: boolean): ReviewDrawing[] | null {
  const [studio, setStudio] = useState<ReviewDrawing[] | null>(null);
  const [byProject, setByProject] = useState<Record<string, ReviewDrawing[]>>({});
  const key = projectIds.join('|');
  useEffect(() => {
    if (!on || !orgId || !reviewer) return;
    return watchStudioReviews(orgId, setStudio, () => setStudio([]));
  }, [orgId, reviewer, on]);
  useEffect(() => {
    if (!on || !orgId || reviewer) return;
    const offs = projectIds.slice(0, 12).map((id) => watchProjectDrawings(orgId, id, (list) => setByProject((m) => ({ ...m, [id]: list })), () => setByProject((m) => ({ ...m, [id]: [] }))));
    return () => offs.forEach((off) => off());
  }, [orgId, reviewer, key, on]);
  if (!on) return null;
  if (reviewer) return studio;
  if (projectIds.length && !Object.keys(byProject).length) return null;
  const all: ReviewDrawing[] = [];
  for (const k of Object.keys(byProject)) all.push(...byProject[k]);
  return all;
}

function useUpcoming(projectIds: string[], on: boolean): Upcoming[] | null {
  const [list, setList] = useState<Upcoming[] | null>(null);
  const key = projectIds.join('|');
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () => loadVisits(projectIds).then((v) => { if (live) setList(upcoming(v, businessDate(new Date()))); }).catch(() => { if (live) setList([]); });
    load();
    const t = window.setInterval(load, 5 * 60000);
    return () => { live = false; window.clearInterval(t); };
  }, [key, on]);
  return list;
}


export function useHomeFeeds(projects: any[], role: string, roles?: string[]): HomeFeeds {
  const org: any = useOrg();
  const orgId = String(org?.orgData?.tenantId || '');
  const email = String(org?.currentUserAuth?.email || '').trim().toLowerCase();
  const who = roles?.length ? roles : role;
  const desk = mayOpenStudioTab('design-review', who);
  const reviewer = desk && canReview(who);
  const people = mayOpenStudioTab('people', who);
  const visitsOn = desk || mayOpenStudioTab('ops-desk', who);
  const ids = useMemo(() => projects.filter(LIVE).map((p: any) => String(p.id)), [projects]);
  const names = useMemo(() => new Map(projects.map((p: any) => [String(p.id), String(p?.context?.name || p?.name || 'Project')])), [projects]);
  const rows = useDeskRows(orgId, reviewer, ids, desk);
  const visits = useUpcoming(ids, visitsOn);
  const viewer = useMemo(() => ({ reviewer, email }), [reviewer, email]);
  return { who, orgId, email, desk, reviewer, people, visitsOn, viewer, rows, visits, names };
}

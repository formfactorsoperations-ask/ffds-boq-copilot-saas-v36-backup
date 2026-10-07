import React, { useEffect, useMemo, useState } from 'react';
import { useOrg } from '../../contexts/OrgContext';
import { canReview } from '../../lib/drawingReview';
import { watchStudioReviews, takeOpenRequest, type ReviewDrawing } from '../../services/drawingReviewService';
import DeskView from './DeskView';
import ReviewInbox, { queueOf } from './ReviewInbox';
import SheetStudio, { type Me } from './SheetStudio';
import { ToastHost, ReviewStyles } from './ui';

/*
  DESIGN REVIEW, the studio tab.

  A Designer gets their Drawing Desk. The Design Head (and the studio's Owner
  and Admins) open on the review inbox, with their own desk one tap away,
  since the principal architect draws too. Opening a sheet replaces the view
  with the review screen; leaving it comes back to where you were.
*/

interface Props {
  projects: any[];
}

const PREF = 'ffds_design_review_project';

export default function DesignReviewTab({ projects }: Props) {
  const { orgData, currentRole, currentUserAuth } = useOrg();
  const orgId = orgData?.tenantId || 'demo-tenant-01';
  const role = String(currentRole || '');
  const reviewer = canReview(role);
  const me: Me = {
    uid: currentUserAuth?.uid || '',
    email: String(currentUserAuth?.email || '').toLowerCase(),
    name: currentUserAuth?.displayName || currentUserAuth?.email || 'You',
  };

  const list = useMemo(() => (projects || [])
    .map((p: any) => ({ id: String(p.id), name: String(p.context?.name || p.name || p.context?.clientName || 'Project') }))
    .filter((p) => p.id), [projects]);
  const [inboxNames, setInboxNames] = useState<Record<string, string>>({});
  const nameOf = (id: string) => list.find((p) => p.id === id)?.name || inboxNames[id] || '';

  const [view, setView] = useState<'review' | 'desk'>(reviewer ? 'review' : 'desk');
  const [projectId, setProjectIdRaw] = useState<string | null>(() => {
    try { const saved = localStorage.getItem(PREF); if (saved) return saved; } catch { /* storage off */ }
    return null;
  });
  const setProjectId = (id: string) => { setProjectIdRaw(id); try { localStorage.setItem(PREF, id); } catch { /* storage off */ } };
  useEffect(() => {
    if (list.length && (!projectId || !list.some((p) => p.id === projectId))) setProjectIdRaw(list[0].id);
  }, [list, projectId]);

  const [open, setOpen] = useState<{ projectId: string; drawingId: string } | null>(() => takeOpenRequest());
  useEffect(() => { if (open && list.some((p) => p.id === open.projectId)) setProjectIdRaw(open.projectId); }, [open?.projectId]);

  const [inbox, setInbox] = useState<ReviewDrawing[] | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  useEffect(() => {
    if (!reviewer) return;
    return watchStudioReviews(orgId, (rows) => {
      setInbox(rows); setInboxError(null);
      setInboxNames(Object.fromEntries(rows.filter((r) => r.review?.projectName).map((r) => [r.projectId, r.review!.projectName as string])));
    }, (e) => setInboxError(/index/i.test(String(e?.message)) ? 'The inbox index is still building. Try again in a few minutes.' : 'Check the connection and try again.'));
  }, [orgId, reviewer]);

  const queue = useMemo(() => queueOf(inbox).map((d) => ({ projectId: d.projectId, drawingId: d.id })), [inbox]);
  const openSheet = (pid: string, did: string) => { setOpen({ projectId: pid, drawingId: did }); window.scrollTo({ top: 0 }); };

  return (
    <ToastHost>
      <ReviewStyles />
      <div className="mx-auto w-full max-w-[1360px] px-4 pb-36 pt-6 md:px-5">
        {open ? (
          <SheetStudio
            key={`${open.projectId}/${open.drawingId}`}
            orgId={orgId} projectId={open.projectId} drawingId={open.drawingId} projectName={nameOf(open.projectId)}
            role={role} me={me} queue={reviewer ? queue : []}
            onClose={() => setOpen(null)}
            onOpen={(n) => openSheet(n.projectId, n.drawingId)}
          />
        ) : (
          <>
            {reviewer && (
              <div className="mb-5 inline-flex rounded-full border border-[#E1E7E3] bg-[#F3F6F4] p-0.5" role="group" aria-label="View">
                {(['review', 'desk'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                    className={`rounded-full px-4 py-1.5 text-[13px] font-bold ${view === v ? 'bg-white text-[#14211E] shadow-sm' : 'text-[#66786F]'}`}>
                    {v === 'review' ? `Review${queue.length ? ` · ${queue.length}` : ''}` : 'My desk'}
                  </button>
                ))}
              </div>
            )}
            {reviewer && view === 'review'
              ? <ReviewInbox rows={inbox} error={inboxError} projectName={nameOf} me={me} onOpen={openSheet} />
              : <DeskView orgId={orgId} projects={list} projectId={projectId} setProjectId={setProjectId} role={role} me={me} onOpen={openSheet} />}
          </>
        )}
      </div>
    </ToastHost>
  );
}

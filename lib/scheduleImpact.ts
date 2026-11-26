import type { PaymentMilestone } from '../types';

/*
  What a change to the payment schedule leaves behind.

  Money's milestones are live: the board, the proposal, project home, alerts,
  reports and the team view all re-read them. What the client holds is not:
  the issued payment schedule (a version in `paymentSchedules`, frozen into a
  Documents issue), the issued execution agreement (it froze the milestones
  when it was issued) and the client's portal (sent by hand). This works out
  which of those are now older than the schedule, so Money can say what to
  bring up to date, in order.
*/

const cleanName = (s?: string) => (s || '').replace(' (Gross)', '').trim();

/**
 * Has the schedule moved since `latest` was generated? Compares every field
 * the schedule document prints: stage, track, share or fixed amount, when it
 * is due and what it unlocks.
 */
export function scheduleDiffers(milestones: PaymentMilestone[], latest: { advances?: any[] } | null | undefined): boolean {
  if (!latest) return false;
  const adv = latest.advances || [];
  if (milestones.length !== adv.length) return true;
  return milestones.some((m, i) => {
    const a = adv[i];
    if (!a) return true;
    if (a.milestoneId && a.milestoneId !== m.id) return true;
    const phase = a.phase === 'design' ? 'design' : 'execution';
    if ((m.type || 'design') !== phase) return true;
    if (cleanName(m.name) !== cleanName(a.label)) return true;
    if (!!m.isFixedAmount !== !!a.isFixedAmount) return true;
    if (m.isFixedAmount ? Math.round(Number(m.fixedAmount) || 0) !== Math.round(Number(a.fixedAmount) || 0) : (Number(m.percentage) || 0) !== (Number(a.percentage) || 0)) return true;
    if ((m.unlocks || '') !== (a.unlocks || '')) return true;
    if (m.trigger && m.trigger !== a.dueCondition) return true;
    return false;
  });
}

/** The client accepted the schedule only if they accepted after the latest version was generated. */
export function acceptedLatest(engagement: any, latest: { issuedAt?: number } | null | undefined): boolean {
  if (engagement?.status !== 'acknowledged') return false;
  if (!latest?.issuedAt || !engagement?.acknowledgedAt) return true;
  return Number(engagement.acknowledgedAt) >= Number(latest.issuedAt);
}

export type ImpactStep = {
  key: 'generate' | 'reissue-schedule' | 'reissue-agreement' | 'portal';
  title: string;
  why: string;
  /** A tab to open (App's `change-tab`), or the Money action to run. */
  go: { tab: string } | { action: 'generate' };
  label: string;
};

const latestIssue = (context: any, kind: string) => {
  const stored = (context?.documents?.issues || []).filter((i: any) => i.kind === kind && !i.addendumTo);
  return stored.length ? stored.reduce((a: any, b: any) => ((b.version || 0) > (a.version || 0) ? b : a)) : null;
};

/**
 * What the client holds that is now older than the schedule, in the order to
 * bring it up to date: generate the revised schedule, re-issue it (and the
 * execution agreement, which froze the milestones), then send the portal.
 */
export function clientCopiesBehind(context: any, milestones: PaymentMilestone[]): ImpactStep[] {
  const schedules: any[] = context?.paymentSchedules || [];
  const latest = schedules.length ? schedules.reduce((a, b) => (a.version > b.version ? a : b)) : null;
  const changes: any[] = (context?.financials?.scheduleChanges || []).filter((c: any) => c.kind === 'schedule');
  const lastChange = changes.length ? Math.max(...changes.map(c => Date.parse(c.date) || 0)) : 0;
  const steps: ImpactStep[] = [];
  const scheduleIssue = latestIssue(context, 'payment_schedule');
  const agreementIssue = latestIssue(context, 'execution_agreement');

  if (latest && scheduleDiffers(milestones, latest)) {
    steps.push({ key: 'generate', title: `Generate the revised payment schedule (v${latest.version + 1})`, why: `v${latest.version} has the milestones as they were.`, go: { action: 'generate' }, label: 'Generate' });
  }
  const scheduleBehind = !!scheduleIssue && !!latest && (Number(scheduleIssue.issuedAt) || 0) < (Number(latest.issuedAt) || 0);
  if (scheduleIssue && (scheduleBehind || steps.length)) {
    steps.push({ key: 'reissue-schedule', title: 'Re-issue the payment schedule to the client', why: `The client holds the copy issued on ${new Date(scheduleIssue.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`, go: { tab: 'docs' }, label: 'Open Documents' });
  }
  if (agreementIssue && lastChange > (Number(agreementIssue.issuedAt) || 0)) {
    const signed = !!(agreementIssue.signature || agreementIssue.signedAt || agreementIssue.status === 'signed');
    steps.push({ key: 'reissue-agreement', title: 'Re-issue the execution agreement', why: `It lists the milestones as they were on ${new Date(agreementIssue.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${signed ? ', and the client signed that version' : ''}.`, go: { tab: 'docs' }, label: 'Open Documents' });
  }
  if (steps.length || (scheduleIssue && lastChange > (Number(scheduleIssue.issuedAt) || 0))) {
    steps.push({ key: 'portal', title: "Send the latest to the client's portal", why: 'The portal shows the client what was last sent, including what each milestone costs.', go: { tab: 'client-portal' }, label: 'Open Client portal' });
  }
  return steps;
}

/** The next invoice number for a project: one past the highest already used, so adding or moving a stage never repeats one. */
export function nextInvoiceSeq(milestones: PaymentMilestone[], index: number): string {
  const used = (milestones || []).map(m => /-(\d+)$/.exec(m.invoiceNumber || '')?.[1]).filter(Boolean).map(Number);
  const n = used.length ? Math.max(...used) + 1 : 1;
  return String(n).padStart(2, '0');
}

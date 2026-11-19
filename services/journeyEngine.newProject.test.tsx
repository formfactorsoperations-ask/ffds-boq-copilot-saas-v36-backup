import React, { useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateDoc } from 'firebase/firestore';
import { JourneyProvider, useJourney, StepWithStatus } from './journeyEngine';
import type { ProjectContext } from '../types';

/*
  A new project used to come up as Won with every Design step ticked on the
  Ops Matrix. It had no status, which the Terms Docket rule read as "past the
  lead stage"; that Contracting step put the project at Stage 3, and Stage 3
  then ticked Design.
*/

let storedSteps: string[] = [];

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, path) => ({ path })),
  collection: vi.fn((_db, path) => ({ path })),
  onSnapshot: vi.fn((ref: { path: string }, next: (snap: any) => void) => {
    const ids = ref.path.endsWith('/journeySteps') ? storedSteps : [];
    next({ docs: ids.map((id) => ({ id, data: () => ({ key: id, status: 'done', completedAt: null, completedByName: null }) })) });
    return () => {};
  }),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));
vi.mock('./firebaseClient', () => ({ db: {} }));
vi.mock('../contexts/OrgContext', () => ({ useOrg: () => ({ currentUserAuth: { uid: 'u1' } }) }));

let latest: ProjectContext;
let steps: StepWithStatus[] = [];
function Probe() {
  steps = useJourney().steps;
  return null;
}
function Harness({ initial }: { initial: ProjectContext }) {
  const [ctx, setCtx] = useState<ProjectContext>(initial);
  latest = ctx;
  return (
    <JourneyProvider projectId="p1" projectContext={ctx} setProjectContext={setCtx as any}>
      <Probe />
    </JourneyProvider>
  );
}

const doneIn = (phase: number) => steps.filter((s) => s.phase === phase && s.status === 'done').map((s) => s.id);

describe('a new project on the Ops Matrix', () => {
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement('div'));
    vi.mocked(updateDoc).mockClear();
  });
  afterEach(() => act(() => root.unmount()));

  const mount = async (ctx: ProjectContext, done: string[] = []) => {
    storedSteps = done;
    await act(async () => root.render(<Harness initial={ctx} />));
  };

  it.each([
    ['as created now', { status: 'lead' }],
    ['saved before it had a status', {}],
  ])('stays a lead with nothing done, %s', async (_label, over) => {
    await mount({ name: 'New Project', location: 'Mumbai', area: 0, config: '2-BHK', rooms: [], ...over } as ProjectContext);
    expect(latest.status ?? 'lead').toBe('lead');
    expect(latest.lifecycle?.stage ?? 1).toBe(1);
    expect(steps.filter((s) => s.status === 'done')).toEqual([]);
    expect(steps.find((s) => s.id === 'discovery_scheduled')?.status).toBe('active');
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
  });

  it('moves to Scope & Strategy, not Won, once Discovery is completed', async () => {
    await mount(
      { name: 'Sea Breeze', rooms: [], status: 'lead' } as ProjectContext,
      ['discovery_scheduled', 'discovery_completed'],
    );
    expect(latest.lifecycle?.stage).toBe(2);
    expect(latest.status).toBe('draft');
    expect(doneIn(1)).toEqual([]);
    expect(doneIn(2)).toEqual([]);
  });

  it('still counts an acknowledged docket', async () => {
    await mount({
      name: 'Sea Breeze', rooms: [], status: 'lead',
      termsDockets: [{ status: 'acknowledged' }],
    } as unknown as ProjectContext);
    expect(doneIn(2)).toEqual(['terms_docket_acknowledged']);
  });

  it('does not tick steps from data every project has', async () => {
    await mount(
      {
        name: 'Palacia - 3BHK', area: 1450, status: 'won',
        rooms: [{ id: 'r1', name: 'Kitchen' }, { id: 'r2', name: 'Master Bedroom' }],
        paymentMilestones: [
          { id: 'd1', type: 'design', name: 'Booking', status: 'pending' },
          { id: 'e1', type: 'execution', name: 'Advance', status: 'paid' },
        ],
      } as unknown as ProjectContext,
      ['discovery_scheduled', 'discovery_completed'],
    );
    const status = (id: string) => steps.find((s) => s.id === id)?.status;
    // Rooms come with every BOQ: they are not a frozen brief or a presented plan.
    expect(status('brief_frozen')).not.toBe('done');
    expect(status('space_planning_presented')).not.toBe('done');
    // A paid execution advance is not a design fee.
    expect(status('design_fee_received')).not.toBe('done');
    expect(latest.journeySummary?.doneSteps).toEqual(['discovery_scheduled', 'discovery_completed']);
  });

  it.each([
    ['exists', {}, false],
    ['is issued', { documents: { issues: [{ kind: 'payment_schedule', version: 1 }] } }, true],
  ])('ticks Payment Schedule Sent only once the schedule is issued: when it %s', async (_l, over, expected) => {
    await mount({
      name: 'Sea Breeze', rooms: [], status: 'lead',
      paymentMilestones: [{ id: 'd1', type: 'design', name: 'Booking', status: 'pending' }],
      ...over,
    } as unknown as ProjectContext, ['boq_shared']);
    expect(steps.find((s) => s.id === 'payment_schedule_sent')?.status === 'done').toBe(expected);
  });

  it('still fills in the earlier steps of a project set past Contracting', async () => {
    await mount({
      name: 'Sea Breeze', rooms: [], status: 'won',
      lifecycle: { stage: 4, subState: 'active', gates: {}, enteredStageAt: 0, updatedAt: 0 },
    } as unknown as ProjectContext);
    expect(steps.find((s) => s.id === 'terms_docket_acknowledged')?.status).toBe('done');
    expect(steps.filter((s) => s.phase === 1).every((s) => s.status === 'done')).toBe(true);
  });
});

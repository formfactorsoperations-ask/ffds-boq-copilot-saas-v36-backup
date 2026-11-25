import React, { useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateDoc } from 'firebase/firestore';
import { JourneyProvider } from './journeyEngine';
import type { ProjectContext } from '../types';

/*
  A status set by hand in the Lifecycle & Status Studio used to be written
  straight back by the journey's auto-sync: Won → Drafting came back as Won.
*/

let emitJourneySteps: ((ids: string[]) => void) | null = null;
// What Firestore holds when the provider subscribes; the first snapshot carries it.
let storedSteps: string[] = [];

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, path) => ({ path })),
  collection: vi.fn((_db, path) => ({ path })),
  onSnapshot: vi.fn((ref: { path: string }, next: (snap: any) => void) => {
    const emit = (ids: string[]) => next({
      docs: ids.map((id) => ({ id, data: () => ({ key: id, status: 'done', completedAt: null, completedByName: null }) })),
    });
    if (ref.path.endsWith('/journeySteps')) {
      emitJourneySteps = emit;
      emit(storedSteps);
    } else emit([]);
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

// A Contracting step done by hand: the journey reads the project as Stage 4, "won".
const CONTRACTING_DONE = ['exec_advance_1_received'];
// An Execution step on top: Stage 5, past anything chosen below.
const EXECUTION_DONE = [...CONTRACTING_DONE, 'phase1_work_complete'];

let latest: ProjectContext;
function Harness({ initial }: { initial: ProjectContext }) {
  const [ctx, setCtx] = useState<ProjectContext>(initial);
  latest = ctx;
  return (
    <JourneyProvider projectId="p1" projectContext={ctx} setProjectContext={setCtx as any}>
      <span />
    </JourneyProvider>
  );
}

const base = (over: Partial<ProjectContext>): ProjectContext => ({
  name: 'Kalpataru Expansia',
  rooms: [],
  lifecycle: { stage: 2, subState: 'active', gates: {}, enteredStageAt: 0, updatedAt: 0 } as any,
  ...over,
} as ProjectContext);

describe('journey auto-sync and a hand-set status', () => {
  let root: Root;
  let el: HTMLDivElement;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    el = document.createElement('div');
    root = createRoot(el);
    vi.mocked(updateDoc).mockClear();
  });
  afterEach(() => act(() => root.unmount()));

  const mount = async (ctx: ProjectContext, steps: string[]) => {
    storedSteps = steps;
    await act(async () => root.render(<Harness initial={ctx} />));
  };

  it('still derives status from the journey when nobody chose one', async () => {
    await mount(base({ status: 'draft' }), CONTRACTING_DONE);
    expect(latest.status).toBe('won');
  });

  it('keeps Drafting after a Won project is moved back by hand', async () => {
    await mount(
      base({ status: 'draft', statusPin: { status: 'draft', stage: 2, at: 1, journeyStage: null } }),
      CONTRACTING_DONE,
    );
    expect(latest.status).toBe('draft');
    expect(latest.lifecycle?.stage).toBe(2);
    expect(latest.statusPin?.journeyStage).toBe(4);
    for (const [, payload] of vi.mocked(updateDoc).mock.calls) {
      expect((payload as any)['context.status']).not.toBe('won');
    }
  });

  it('hands back to the journey once it moves past the choice', async () => {
    await mount(
      base({ status: 'draft', statusPin: { status: 'draft', stage: 2, at: 1, journeyStage: 4 } }),
      CONTRACTING_DONE,
    );
    expect(latest.status).toBe('draft');
    await act(async () => emitJourneySteps!(EXECUTION_DONE));
    expect(latest.status).toBe('execution');
    expect(latest.statusPin).toBeNull();
  });

  /*
    Won is the sign-up payment, and the design follows it: on the Ops Matrix
    Sign-up comes before Design. Stage 4 used to clear every Design step.
  */
  const DESIGN = [
    'brief_frozen', 'space_planning_presented', 'visuals_3d_shared', 'revisions_incorporated',
    'design_approved', 'boq_shared', 'working_drawings_done',
  ];
  const SIGNUP = ['terms_docket_acknowledged', 'payment_schedule_sent', 'design_fee_received', 'onboarding_kit_sent'];
  const won = (over: Partial<ProjectContext> = {}) => base({
    status: 'won',
    lifecycle: { stage: 4, subState: 'active', gates: {}, enteredStageAt: 0, updatedAt: 0 } as any,
    statusPin: { status: 'won', stage: 4, at: 1, journeyStage: null },
    ...over,
  });

  it('reads a Won chosen by hand as signed up, with the design still to do', async () => {
    await mount(won(), []);
    expect(latest.status).toBe('won');
    expect(latest.lifecycle?.stage).toBe(4);
    expect(latest.journeySummary?.doneSteps).toEqual(['discovery_scheduled', 'discovery_completed', ...SIGNUP]);
    for (const id of [...DESIGN, 'agreement_signed']) expect(latest.journeySummary?.doneSteps).not.toContain(id);
  });

  it('does the same for a Won the journey reached by itself', async () => {
    await mount(base({ status: 'won', lifecycle: { stage: 4, subState: 'active', gates: {}, enteredStageAt: 0, updatedAt: 0 } as any }), []);
    expect(latest.status).toBe('won');
    for (const id of DESIGN) expect(latest.journeySummary?.doneSteps).not.toContain(id);
  });

  it('leaves the design open on a design-only project won by hand', async () => {
    await mount(won({ engagementType: 'design_only' } as any), []);
    expect(latest.status).toBe('won');
    for (const id of ['brief_frozen', 'design_approved', 'working_drawings_done']) {
      expect(latest.journeySummary?.doneSteps).not.toContain(id);
    }
  });

  it('wins the project on the sign-up payment, with nothing of the design done', async () => {
    await mount(
      base({ status: 'negotiation', lifecycle: { stage: 3, subState: 'active', gates: {}, enteredStageAt: 0, updatedAt: 0 } as any,
        paymentMilestones: [{ id: 'd1', type: 'design', name: 'Sign-up', status: 'paid' }] as any }),
      ['discovery_scheduled', 'discovery_completed'],
    );
    expect(latest.status).toBe('won');
    expect(latest.lifecycle?.stage).toBe(4);
    for (const id of DESIGN) expect(latest.journeySummary?.doneSteps).not.toContain(id);
  });

  it('keeps a project in its proposal there: the matrix has no proposal step', async () => {
    await mount(base({ status: 'proposal_sent', lifecycle: { stage: 3, subState: 'active', gates: {}, enteredStageAt: 0, updatedAt: 0 } as any }), []);
    expect(latest.status).toBe('proposal_sent');
    expect(latest.lifecycle?.stage).toBe(3);
  });

  it('reads the design as behind a project in execution', async () => {
    await mount(base({ status: 'won' }), EXECUTION_DONE);
    expect(latest.status).toBe('execution');
    expect(latest.journeySummary?.doneSteps).toEqual(expect.arrayContaining(DESIGN));
  });

  it('ignores a pin for a status the project no longer has', async () => {
    // The pin names Drafting but the project has since been promoted: the pin is spent.
    await mount(
      base({ status: 'negotiation', statusPin: { status: 'draft', stage: 2, at: 1, journeyStage: 4 } }),
      CONTRACTING_DONE,
    );
    expect(latest.status).toBe('won');
  });
});

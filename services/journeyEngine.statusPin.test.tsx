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

  it('ignores a pin for a status the project no longer has', async () => {
    // The pin names Drafting but the project has since been promoted: the pin is spent.
    await mount(
      base({ status: 'negotiation', statusPin: { status: 'draft', stage: 2, at: 1, journeyStage: 4 } }),
      CONTRACTING_DONE,
    );
    expect(latest.status).toBe('won');
  });
});

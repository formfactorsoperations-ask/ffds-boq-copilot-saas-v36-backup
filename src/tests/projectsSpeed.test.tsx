/*
  The Projects screen opens without going back to Firestore for what it already
  holds (components/ProjectListTab.tsx, components/PaymentHealth.tsx).

  Each card's payment badge used to fetch its own project document -- the whole
  of it, inflated again -- plus two subcollections, so forty projects meant forty
  full downloads and eighty queries before the screen settled. The cards were
  also all built before the first was painted.
*/
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const reads = { getDoc: 0, getDocs: 0, onSnapshot: 0 };

vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: null, storage: null, functions: null, isFirebaseConfigured: () => true }));
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    collection: () => ({}),
    collectionGroup: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    getDoc: async () => { reads.getDoc++; return { exists: () => false, data: () => undefined }; },
    getDocs: async () => { reads.getDocs++; return { docs: [], empty: true, size: 0 }; },
    onSnapshot: () => { reads.onSnapshot++; return () => {}; },
  };
});
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't1', team: [] }, currentRole: 'Admin', updateOrgData: async () => {}, teamMembers: [] }),
}));

const milestones = [
  { id: 'm1', name: 'Advance', percentage: 10, status: 'paid', lockedTaxableBase: 1000000 },
  { id: 'm2', name: 'Design', percentage: 30, status: 'pending', lockedTaxableBase: 1000000 },
];
const project = (i: number) => ({
  id: `p${i}`, tenantId: 't1', lastModified: 1000 - i,
  context: { name: `Project ${i}`, clientName: `Client ${i}`, status: 'execution', rooms: [], paymentMilestones: milestones },
  tiers: [], activeTierId: null,
});

beforeEach(() => { reads.getDoc = 0; reads.getDocs = 0; reads.onSnapshot = 0; });

describe('Projects screen speed', () => {
  it('a badge given its milestones reads nothing', async () => {
    const { ProjectPaymentBadge } = await import('../../components/PaymentHealth');
    await act(async () => { render(<ProjectPaymentBadge projectId="p1" milestones={milestones} />); });
    expect(reads).toEqual({ getDoc: 0, getDocs: 0, onSnapshot: 0 });
  });

  it('a project with no milestones reads the two legacy lists, never the project, and only once a minute', async () => {
    const { ProjectPaymentBadge } = await import('../../components/PaymentHealth');
    await act(async () => { render(<ProjectPaymentBadge projectId="legacy" milestones={[]} />); });
    expect(reads.getDoc).toBe(0);
    expect(reads.getDocs).toBe(2);
    await act(async () => { render(<ProjectPaymentBadge projectId="legacy" milestones={[]} />); });
    expect(reads.getDocs).toBe(2);
  });

  it('opens with no Firestore reads, and paints a screenful before the rest', async () => {
    const { default: ProjectListTab } = await import('../../components/ProjectListTab');
    const projects = Array.from({ length: 30 }, (_, i) => project(i));
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(
        <ProjectListTab projects={projects as any} activeProjectId={null} onOpenProject={() => {}}
          onCreateNew={() => {}} onDeleteProject={() => {}} onDuplicateProject={() => {}} />,
      );
    });
    const cards = () => new Set(
      Array.from(view!.container.querySelectorAll('[aria-label^="Project "]')).map((e) => e.getAttribute('aria-label')),
    ).size;
    expect(cards()).toBe(12);
    for (let k = 0; k < 10 && cards() < projects.length; k++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    expect(cards()).toBe(30);
    expect(reads).toEqual({ getDoc: 0, getDocs: 0, onSnapshot: 0 });
  }, 30000);
});

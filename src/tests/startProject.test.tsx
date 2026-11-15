/*
  New Project starts from a lead: pick one (or add it right there), and the
  project opens the way Ops Desk opens one.
*/
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { startableLeads, leadOpenedAsProject, quickLeadDraft, draftProblems, blankDraft, type Lead } from '../../lib/leads';

const h = vi.hoisted(() => ({ leads: [] as any[], saved: [] as any[], created: [] as any[], assigned: [] as any[] }));

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 's1' }, currentUserAuth: { email: 'anish@ffds.in', displayName: 'Anish K' } }),
}));
vi.mock('../../services/projectTeam', () => ({
  useProjectTeam: () => ({ toggle: async (p: any, email: string) => { h.assigned.push([p.id, email]); } }),
}));
vi.mock('../../services/leadsService', () => ({
  loadLeads: async () => h.leads,
  createLead: async (d: any, x: any) => {
    const l = { ...lead('new1', 'new', d.people[0].name), people: d.people, home: d.home, ownerEmail: x.owner.email, ownerName: x.owner.name };
    h.created.push(l);
    return l;
  },
  saveLead: async (l: any) => { h.saved.push(l); return l; },
  withTouch: (l: any, t: any) => ({ ...l, touches: [...(l.touches || []), t] }),
}));

import StartProjectModal from '../../components/projects/StartProjectModal';

function lead(id: string, stage: any, name: string, extra: Partial<Lead> = {}): Lead {
  return {
    id, tenantId: 's1', createdAt: 1, createdBy: 'riya@ffds.in', createdByName: 'Riya', ownerEmail: 'riya@ffds.in', ownerName: 'Riya',
    people: [{ id: 'p', name, role: 'Main contact', phone: '+91 98200 00000', email: '', main: true }],
    home: { where: 'Lodha Amara, Thane', type: '2-BHK', area: 650, scope: [], possession: '', budget: '' },
    source: 'referral', sourceNote: '', enquiry: '', stage, lostReason: null, know: { decides: '', style: '', seenWork: false },
    next: null, touches: [], firstTouchAt: null, lastTouchAt: null, openRequest: null, projectId: null, updatedAt: 1, updatedBy: '',
    ...extra,
  } as Lead;
}

beforeEach(() => {
  h.leads = [
    lead('a', 'measured', 'Mrs Naik', { lastTouchAt: 50 }),
    lead('b', 'talking', 'Mr Mehta', { lastTouchAt: 90 }),
    lead('c', 'lost', 'Waghmare family'),
    lead('d', 'won', 'Ms Dalal', { projectId: 'p-old' }),
  ];
  h.saved = []; h.created = []; h.assigned = [];
});
afterEach(cleanup);

describe('Which leads a project can start from', () => {
  it('is the open and won ones without a project, most recently active first', () => {
    expect(startableLeads(h.leads).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('links the lead and moves it to Proposal sent, as Ops Desk does', () => {
    const { lead: l, touch } = leadOpenedAsProject(h.leads[0], 'p1');
    expect(l).toMatchObject({ projectId: 'p1', stage: 'proposal', openRequest: null });
    expect(touch.text).toBe('Moved to Proposal sent');
    expect(leadOpenedAsProject(lead('x', 'proposal', 'X'), 'p2').lead.stage).toBe('proposal');
  });

  it('a lead typed in while starting has what a lead needs', () => {
    const d = quickLeadDraft({ name: 'Rahul Sharma', phone: '+91 98765 43210', email: '', where: 'Thane', source: 'walkin' }, Date.now());
    expect(draftProblems(d)).toEqual([]);
    expect(draftProblems(quickLeadDraft({ name: 'Rahul', phone: '', email: '', where: '', source: 'walkin' }, Date.now()))).toEqual(['a phone or email to reach them']);
    expect(draftProblems(blankDraft(Date.now())).length).toBeGreaterThan(0);
  });
});

describe('New Project window', () => {
  const setup = (canStart = true) => {
    const createProject = vi.fn(async (ctx: any) => { expect(ctx.leadId).toBeTruthy(); return 'p-new'; });
    const onOpened = vi.fn();
    const onPractice = vi.fn();
    render(<StartProjectModal canStart={canStart} createProject={createProject} onOpened={onOpened} onPractice={onPractice} onClose={() => undefined} />);
    return { createProject, onOpened, onPractice };
  };

  it('starts the project from the lead picked, linked and on its owner\'s desk', async () => {
    const { createProject, onOpened } = setup();
    await screen.findByText('Mr Mehta');
    expect(screen.queryByText('Waghmare family')).toBeNull();
    expect(screen.queryByText('Ms Dalal')).toBeNull();
    fireEvent.click(screen.getByText('Mrs Naik'));
    fireEvent.click(screen.getByRole('button', { name: 'Start the project' }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('p-new'));
    expect(createProject.mock.calls[0][0]).toMatchObject({ clientName: 'Mrs Naik', leadId: 'a', config: '2-BHK' });
    expect(h.saved[0]).toMatchObject({ id: 'a', projectId: 'p-new', stage: 'proposal' });
    expect(h.assigned).toEqual([['p-new', 'riya@ffds.in']]);
  });

  it('adds a lead that is not on the desk yet, then starts from it', async () => {
    const { createProject, onOpened } = setup();
    fireEvent.click(await screen.findByText(/Not in Ops Desk yet/));
    const start = screen.getByRole('button', { name: 'Add lead and start' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Rahul Sharma' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+91 98765 43210' } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('p-new'));
    expect(h.created[0].people[0].name).toBe('Rahul Sharma');
    expect(createProject.mock.calls[0][0]).toMatchObject({ clientName: 'Rahul Sharma', leadId: 'new1' });
    expect(h.saved[0]).toMatchObject({ id: 'new1', projectId: 'p-new' });
    expect(h.assigned).toEqual([]); // their own lead
  });

  it('offers a practice project without a lead', async () => {
    const { onPractice } = setup();
    fireEvent.click(await screen.findByText('Practice or demo project (no lead)'));
    expect(onPractice).toHaveBeenCalled();
  });

  it('tells someone who does not run the desk whom to ask', () => {
    setup(false);
    expect(screen.getByText('Projects start from a lead')).toBeTruthy();
    expect(screen.getByText(/Ask an Owner, Admin or Ops Director/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start the project' })).toBeNull();
    expect(screen.queryByText(/Practice or demo project/)).toBeNull();
  });
});

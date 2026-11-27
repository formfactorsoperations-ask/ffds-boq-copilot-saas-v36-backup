/*
  The Conversations workspace on screen (DESIGN.md "Project workspace:
  conversations"): the conversations listed, a conversation's screens opening
  in the full-screen window, the window drawing the screen and closing back,
  the story's Open buttons, and the way out.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

vi.mock('../../services/firebaseClient', () => ({ db: null, auth: null, storage: null, functions: null, isFirebaseConfigured: () => false }));
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { tenantId: 't1' }, currentRoles: ['Owner'] }) }));
vi.mock('../../services/clientThreadService', () => ({
  loadClientRecords: async () => ({
    followUps: [{ id: 'f1', projectId: 'p1', at: Date.now() - 3600000, channel: 'whatsapp', outcome: 'replied', note: 'Payment done, please check. Mood: Positive.', by: 'x', byName: 'Asha' }],
    visits: [], moms: [], meetings: [], leadCreatedAt: {},
  }),
}));
vi.mock('../../services/portalVisitsService', () => ({ watchClientVisits: () => () => {} }));
vi.mock('../../services/opsDeskService', () => ({ logFollowUp: vi.fn(async (f: any) => ({ id: 'n1', ...f, at: Date.now(), by: f.me.email, byName: f.me.name })) }));
vi.mock('../../components/PageTitleBlock', () => ({ default: () => null }));

import ConversationsWorkspace, { type ConversationsWorkspaceProps } from '../../components/projectConversations/ConversationsWorkspace';
import { conversationsFor } from '../../lib/projectConversations';

afterEach(cleanup);

const LABELS: Record<string, string> = { 'payment-calc': 'Money', analytics: 'Money & Offers', 'boq-editor': 'BOQ Editor', 'client-portal': 'Client Portal', 'comms-tracker': 'Messages', timeline: 'Timeline', leadiq: 'Brief & Site' };

function setup(over: Partial<ConversationsWorkspaceProps> = {}) {
  const setActiveTab = vi.fn();
  const onLeaveProject = vi.fn();
  const props: ConversationsWorkspaceProps = {
    projectId: 'p1',
    projectContext: { name: 'Palacia 3BHK', clientName: 'Mrs. Mehta', clientPhone: '9822012345', history: [{ id: 'h1', at: Date.now() - 7200000, actor: 'Asha', category: 'scope', summary: 'BOQ v1 signed' }] },
    activeTab: 'dashboard', setActiveTab, homeRoute: 'dashboard', hubLabel: 'Hub',
    conversations: conversationsFor(new Set(Object.keys(LABELS))),
    labelOf: (r) => LABELS[r] || r,
    needsOf: (r) => (r === 'payment-calc' ? 1 : 0),
    stages: [{ stage: 1, label: 'Initial Consultation', state: 'done', first: 'leadiq' }, { stage: 2, label: 'Scope & Strategy', state: 'now', first: 'boq-editor' }],
    currentStage: 2,
    journey: { done: 14, total: 34, pct: 41, next: 'Send the terms docket', upNext: [{ id: 's1', title: 'Send the terms docket', text: 'Client needs terms', route: 'boq-editor' }] },
    money: null, seesMoney: true, canLog: true, seesVisits: true, tenantId: 't1',
    me: { email: 'owner@studio.in', name: 'Owner' }, statusLabel: 'Won', desks: [],
    onLeaveProject, showHideFigures: false, viewOnly: false,
    children: <div>THE SCREEN</div>,
    ...over,
  };
  const utils = render(<ConversationsWorkspace {...props} />);
  return { ...utils, setActiveTab, onLeaveProject, props };
}

describe('the Conversations workspace', () => {
  it('lists the conversations the person can open, and Whole project first with its next step', () => {
    setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    for (const n of ['Whole project', 'Client & portal', 'Money', 'BOQ', 'Plan & timeline', 'Brief & Site']) expect(list.textContent).toContain(n);
    expect(list.textContent).not.toContain('Site work, snags');
    expect(screen.getAllByText(/Send the terms docket/).length).toBeGreaterThan(0);
    expect(screen.queryByText('THE SCREEN')).toBeNull();
  });

  it('opens a conversation, and its screens open by route', () => {
    const { setActiveTab } = setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.click(within(list).getByRole('button', { name: /^Money/ }));
    expect(screen.getByRole('region', { name: 'Money' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Money & Offers' }));
    expect(setActiveTab).toHaveBeenCalledWith('analytics');
  });

  it('draws the screen in a full-screen window, with its sister screens, and closes back to the conversation', () => {
    const { setActiveTab } = setup({ activeTab: 'payment-calc' });
    const win = screen.getByRole('dialog', { name: 'Money' });
    expect(win.textContent).toContain('THE SCREEN');
    expect(win.textContent).toContain('Palacia 3BHK · Money');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setActiveTab).toHaveBeenCalledWith('dashboard');
  });

  it('opens the Hub from Whole project in the window', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open the Hub' }));
    expect(screen.getByRole('dialog', { name: 'Hub' }).textContent).toContain('THE SCREEN');
  });

  it("tells the story: the client's reply as a quote, and each event with a way to its screen", async () => {
    const { setActiveTab } = setup();
    await waitFor(() => expect(screen.getAllByText(/Payment done, please check/).length).toBeGreaterThan(0));
    expect(screen.getAllByRole('button', { name: /^Open BOQ Editor/ }).length).toBe(2); // the event, and the Up next row
    fireEvent.click(screen.getAllByRole('button', { name: /^Open BOQ Editor/ })[0]);
    expect(setActiveTab).toHaveBeenCalledWith('boq-editor');
  });

  it('keeps the way out on top: All projects leaves the project', () => {
    const { onLeaveProject } = setup();
    fireEvent.click(screen.getByRole('button', { name: /All projects/ }));
    expect(onLeaveProject).toHaveBeenCalledWith('projects');
  });

  it('offers the way back to Classic only when the person may choose', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Use Classic view' })).toBeNull();
    cleanup();
    const onUseClassic = vi.fn();
    setup({ onUseClassic });
    fireEvent.click(screen.getByRole('button', { name: 'Use Classic view' }));
    expect(onUseClassic).toHaveBeenCalled();
  });
});

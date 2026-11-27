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
const seen = vi.hoisted(() => ({ readSeen: vi.fn(async () => null as number | null), markSeen: vi.fn(async () => {}) }));
vi.mock('../../services/projectSeenService', () => seen);
vi.mock('../../components/ops/useHubAlerts', () => ({ useHubAlerts: () => ({ alerts: [], dismiss: () => {} }) }));
vi.mock('../../components/projectConversations/useProjectGlance', () => ({
  useProjectGlance: () => ({
    drawings: { total: 7, issued: 4, approved: 3 }, handoverISO: '2027-03-14', targetISO: null, hasProgramme: true,
    milestones: [{ id: 't1', title: 'Design sign-off', startISO: '2026-12-05' }, { id: 't2', title: 'Site work starts', startISO: '2026-12-08' }],
    items: smart.items,
  }),
}));
const smart = vi.hoisted(() => ({ items: null as any[] | null, care: { care: null, digest: undefined, meetings: null } as any }));
vi.mock('../../components/projectConversations/useProjectCare', () => ({ useProjectCare: () => smart.care }));
const desk = vi.hoisted(() => ({ openInDesignReview: vi.fn(), nudgeHolder: vi.fn(async () => ({ to: 'x' })) }));
vi.mock('../../services/drawingReviewService', async (orig) => ({ ...(await orig<any>()), ...desk }));

import ConversationsWorkspace, { type ConversationsWorkspaceProps } from '../../components/projectConversations/ConversationsWorkspace';
import { conversationsFor } from '../../lib/projectConversations';

afterEach(cleanup);

const LABELS: Record<string, string> = { 'payment-calc': 'Money', analytics: 'Money & Offers', 'boq-editor': 'BOQ Editor', 'client-portal': 'Client Portal', 'comms-tracker': 'Messages', timeline: 'Timeline', leadiq: 'Brief & Site', 'drawing-tracker': 'Drawings', ops: 'Pricing & Tiers' };

const CLASSIC = [
  { route: 'dashboard', label: 'Hub', where: '' },
  { route: 'ops', label: 'Pricing & Tiers', where: 'Scope & Strategy' },
  { route: 'analytics', label: 'Money & Offers', where: 'Scope & Strategy' },
  { route: 'boq-editor', label: 'BOQ Editor', where: 'Scope & Strategy' },
  { route: 'comms-tracker', label: 'Client Messages', where: 'Project Hub' },
];

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
    me: { email: 'owner@studio.in', name: 'Owner' }, statusLabel: 'Won',
    onLeaveProject, viewOnly: false,
    children: <div>THE SCREEN</div>,
    classic: CLASSIC,
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

  it('puts the project inside Projects: the breadcrumb goes back to the list, and the studio bar (App) holds the studio\'s sections (owner, 27 Nov 2026)', () => {
    const { onLeaveProject } = setup();
    expect(screen.queryByRole('button', { name: /All projects/ })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Studio' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Projects' }));
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

  it('keeps Whole project calm: no WhatsApp box, just Record and a note (owner, 27 Nov 2026)', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Open in WhatsApp/ })).toBeNull();
    for (const n of ['Site visit', 'Meeting', 'Decision', 'Add a note']) expect(screen.getByRole('button', { name: new RegExp(n) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add a note/ }));
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeTruthy();
  });

  it('has no WhatsApp box anywhere: messages are written on the Messages screen and on Clients (owner, 27 Nov 2026)', () => {
    setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.click(within(list).getByRole('button', { name: /^Client & portal/ }));
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Add a note for the team/ })).toBeTruthy();
  });

  it('shows an empty conversation where to click: its screens as big buttons', async () => {
    const { setActiveTab } = setup();
    await waitFor(() => expect(screen.getAllByText(/Payment done, please check/).length).toBeGreaterThan(0));
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.click(within(list).getByRole('button', { name: /^Brief & Site/ }));
    expect(screen.getByText(/Start here/)).toBeTruthy();
    const big = screen.getAllByRole('button', { name: /^Brief & Site/ }).find((b) => !list.contains(b))!;
    fireEvent.click(big);
    expect(setActiveTab).toHaveBeenCalledWith('leadiq');
  });

  it('keeps a note in the conversation it was written in, and says what a note is', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByText(/Payment done, please check/).length).toBeGreaterThan(0));
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.click(within(list).getByRole('button', { name: /^Money/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add a note for the team/ }));
    expect(screen.getByText(/Only the studio sees notes/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Client will pay by cheque' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Money' }).textContent).toContain('Client will pay by cheque'));
    fireEvent.click(within(list).getByRole('button', { name: /^Plan & timeline/ }));
    expect(screen.getByRole('region', { name: 'Plan & timeline' }).textContent).not.toContain('Client will pay by cheque');
  });

  it("ranks Up next as the Hub does: a sign-off with Mark done, the engine's own action, and the rest on the Hub", () => {
    const markDone = vi.fn();
    const prepare = vi.fn();
    setup({ journey: { done: 0, total: 34, pct: 0, next: 'Discovery Scheduled', more: 2, upNext: [
      { id: 's', title: 'Discovery Scheduled', badge: 'Your sign-off', actions: [{ label: 'Mark done', run: markDone }] },
      { id: 'e', title: 'Send Terms Docket', actions: [{ label: 'Prepare Terms', run: prepare }] },
    ] } });
    expect(screen.getByText('Your sign-off')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Terms' }));
    expect(markDone).toHaveBeenCalled();
    expect(prepare).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /2 more on the Hub/ }));
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeTruthy();
  });

  it('shows drawings, the handover forecast and the next dates on the card, as the Hub reads them', () => {
    setup();
    const card = screen.getByRole('complementary', { name: 'Project card' });
    expect(card.textContent).toContain('of 7');
    expect(card.textContent).toContain('3 approved');
    expect(card.textContent).toMatch(/14 Mar ’27/);
    expect(card.textContent).toContain('Design sign-off');
    expect(card.textContent).toContain('Site work starts');
  });
  it('finds a screen by its old Classic name or stage, says where it is now, and opens it (plan PR G)', () => {
    const { setActiveTab } = setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'client messages' } });
    const found = within(list).getByRole('group', { name: 'Screens' });
    expect(found.textContent).toContain('Messages');
    expect(found.textContent).toContain('In Client & portal');
    expect(found.textContent).toContain('was “Client Messages” in Project Hub');
    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'scope & strategy' } });
    const byStage = within(list).getByRole('group', { name: 'Screens' });
    for (const n of ['Pricing & Tiers', 'Money & Offers', 'BOQ Editor']) expect(byStage.textContent).toContain(n);
    fireEvent.click(within(byStage).getByRole('button', { name: /^Pricing & Tiers/ }));
    expect(setActiveTab).toHaveBeenCalledWith('ops');
  });

  it('finds the Hub by name and opens it in the window', () => {
    setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.change(within(list).getByRole('textbox'), { target: { value: 'hub' } });
    fireEvent.click(within(within(list).getByRole('group', { name: 'Screens' })).getByRole('button', { name: /^Hub/ }));
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeTruthy();
  });

  it("signposts each window with the screen's Classic place", () => {
    setup({ activeTab: 'ops' });
    expect(screen.getByRole('dialog', { name: 'Pricing & Tiers' }).textContent).toContain('In Classic: Scope & Strategy › Pricing & Tiers');
  });

  it('offers a three-step tour on first open, and plays it again from the top bar', () => {
    window.localStorage.removeItem('studiodesk.projectView.welcomed');
    setup({ onUseClassic: vi.fn() });
    const welcome = screen.getByText(/This is the new project view/).closest('div') as HTMLElement;
    fireEvent.click(within(welcome).getByRole('button', { name: 'Show me around' }));
    expect(screen.getByRole('dialog', { name: 'Your project, as conversations' }).textContent).toContain('1 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Open a screen' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Client & portal' })).toBeTruthy(); // a conversation with Open buttons
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const last = screen.getByRole('dialog', { name: 'The studio is always on top' });
    expect(last.textContent).toContain('Use Classic view puts the old view back');
    expect(last.textContent).toContain('Projects');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Whole project' })).toBeTruthy(); // back where it began
    expect(window.localStorage.getItem('studiodesk.projectView.welcomed')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /Show me around/ }));
    expect(screen.getByRole('dialog', { name: 'Your project, as conversations' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives each conversation icon its own motion, fills the open one, and ripples where you press (owner, 27 Nov 2026)', () => {
    setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    const money = within(list).getByRole('button', { name: /^Money/ });
    expect(money.className).toContain('cvw-hot');
    expect(money.querySelector('.cvw-ic')?.getAttribute('data-m')).toBe('flip');
    expect(within(list).getByRole('button', { name: /^Brief & Site/ }).querySelector('.cvw-ic')?.getAttribute('data-m')).toBe('drop');
    fireEvent.pointerDown(money, { clientX: 10, clientY: 10 });
    expect(money.querySelector('.cvw-ripple')).toBeTruthy();
    fireEvent.click(money);
    const disc = money.querySelector('.cvw-disc') as HTMLElement;
    expect(disc.style.color).toBe('rgb(255, 255, 255)');
    expect(disc.className).toContain('is-pop');
    expect(money.querySelector('.cvw-ic')?.className).toContain('is-play');
  });

  it("gives each conversation Home's colour: its tint at rest, filled when picked (owner, 27 Nov 2026)", () => {
    setup();
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    const plateOf = (name: RegExp) => within(list).getByRole('button', { name }).querySelector('.cvw-disc') as HTMLElement;
    expect(plateOf(/^Money/).style.background).toBe('rgb(251, 245, 234)'); // Home's gold tint
    expect(plateOf(/^Money/).style.color).toBe('rgb(140, 106, 51)');
    expect(plateOf(/^Whole project/).style.background).toBe('rgb(61, 82, 160)'); // picked: brand, filled
    fireEvent.click(within(list).getByRole('button', { name: /^Money/ }));
    expect(plateOf(/^Money/).style.background).toBe('rgb(140, 106, 51)'); // picked: Home's gold, filled
  });

});

/* Smart workspace, PR 1 (owner, 27 Nov 2026): signals, Watch-outs, Money waiting and Since you were here. */
describe('the smart workspace', () => {
  const DAY = 86400000;
  const day = (ago: number) => new Date(Date.now() - ago * DAY).toISOString().slice(0, 10);
  const OWING = {
    name: 'Palacia 3BHK', clientName: 'Mrs. Mehta', status: 'won', currentStage: 3,
    paymentMilestones: [
      { id: 'm1', type: 'design', name: 'Sign-up & Concept', percentage: 40, description: '', status: 'invoiced', invoiceDate: day(20) },
      { id: 'm2', type: 'design', name: 'Design Development', percentage: 60, description: '', status: 'pending' },
    ],
  };
  const MONEY = {
    projectValue: 888186, totalPaid: 0, balanceDue: 888186,
    milestones: [
      { id: 'm1', type: 'design' as const, name: 'Sign-up & Concept', percentage: 40, status: 'invoiced', owed: 10590, invoiceNumber: 'FF-01', invoiceDate: day(20), date: null },
      { id: 'm2', type: 'design' as const, name: 'Design Development', percentage: 60, status: 'pending', owed: 124000, invoiceNumber: null, invoiceDate: null, date: null },
    ],
  };

  it('says what is wrong on the conversation, in words and colour, never with an amount', () => {
    setup({ projectContext: OWING, money: MONEY });
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    const reason = within(within(list).getByRole('button', { name: /^Money/ })).getByText('Sign-up & Concept unpaid 20 days');
    expect(reason.className).toContain('text-rose-700');
    expect(list.textContent).not.toContain('₹');
  });

  it('gathers the worst on Whole project as Watch-outs, each opening its screen', () => {
    const { setActiveTab } = setup({ projectContext: OWING, money: MONEY });
    const box = screen.getByRole('region', { name: 'Watch-outs' });
    expect(box.textContent).toContain('Late');
    expect(box.textContent).toContain('Sign-up & Concept unpaid 20 days');
    fireEvent.click(within(box).getByRole('button', { name: 'Open Money' }));
    expect(setActiveTab).toHaveBeenCalledWith('payment-calc');
  });

  it('opens Money on what is unpaid and what is next to bill, for the roles that see money', () => {
    setup({ projectContext: OWING, money: MONEY });
    const list = screen.getByRole('complementary', { name: "This project's conversations" });
    fireEvent.click(within(list).getByRole('button', { name: /^Money/ }));
    const card = screen.getByRole('region', { name: 'Money waiting' });
    expect(card.textContent).toContain('₹10,590');
    expect(card.textContent).toContain('Sign-up & Concept · 20 days');
    expect(card.textContent).toContain('Next to bill');
    cleanup();
    setup({ projectContext: OWING, money: MONEY, seesMoney: false });
    fireEvent.click(within(screen.getByRole('complementary', { name: "This project's conversations" })).getByRole('button', { name: /^Money/ }));
    expect(screen.queryByRole('region', { name: 'Money waiting' })).toBeNull();
  });

  it('shows no signal for a screen the person cannot open', () => {
    setup({ projectContext: OWING, money: MONEY, conversations: conversationsFor(new Set(['boq-editor', 'timeline'])) });
    expect(screen.queryByRole('region', { name: 'Watch-outs' })).toBeNull();
  });

  it('says what moved since the last visit, and marks this one', async () => {
    seen.readSeen.mockResolvedValueOnce(Date.now() - 2 * DAY);
    setup();
    const card = await screen.findByRole('region', { name: 'Since you were here' });
    expect(card.textContent).toContain('BOQ v1 signed');
    expect(seen.markSeen).toHaveBeenCalledWith('owner@studio.in', 'p1');
    fireEvent.click(within(card).getByRole('button', { name: 'Mark as read' }));
    expect(screen.queryByRole('region', { name: 'Since you were here' })).toBeNull();
  });

  it('says nothing about a first visit', async () => {
    setup();
    await waitFor(() => expect(seen.markSeen).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Since you were here' })).toBeNull();
  });
});

/* Smart workspace, PR 2 (owner, 27 Nov 2026): the Design card, this week's update, the client pulse and the handover checklist. */
describe('the smart workspace, PR 2', () => {
  const DAY = 86400000;
  const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  const CONVS = conversationsFor(new Set(['drawing-tracker', 'comms-tracker', 'client-portal', 'payment-calc', 'timeline']));
  afterEach(() => { smart.items = null; smart.care = { care: null, digest: undefined, meetings: null }; desk.openInDesignReview.mockClear(); });
  const pick = (name: RegExp) => fireEvent.click(within(screen.getByRole('complementary', { name: "This project's conversations" })).getByRole('button', { name }));

  it('opens Design on what will hold up site, who holds it, and the rounds to bill', () => {
    smart.items = [{ id: 'w', name: 'Master bed wardrobe', siteDate: day(-1), review: { state: 'IN_REVIEW', submittedAt: Date.now() - 3 * DAY } }];
    smart.care = { care: null, digest: undefined, meetings: [{ id: 'm', state: 'CLOSED', closedAt: Date.now(), includedRounds: 2, rooms: [{ room: 'Kitchen', round: 3, changes: [], charge: { status: 'to_bill' } }] }] };
    const { onLeaveProject } = setup({ conversations: CONVS, canBillRounds: true });
    pick(/^Design/);
    const card = screen.getByRole('region', { name: 'What will hold up site' });
    expect(card.textContent).toContain('Late for site');
    expect(card.textContent).toContain('With the Design Head 3 days');
    fireEvent.click(within(card).getByRole('button', { name: 'Open' }));
    expect(desk.openInDesignReview).toHaveBeenCalledWith('p1', 'w', { tab: 'dashboard', label: 'Palacia 3BHK' });
    expect(card.textContent).toContain('Kitchen · round 3');
    fireEvent.click(within(card).getByRole('button', { name: 'Bill or waive on the Design Desk' }));
    expect(onLeaveProject).toHaveBeenCalledWith('design-review');
  });

  it('lets someone else nudge whoever holds the drawing, but never themselves', async () => {
    smart.items = [{ id: 'w', name: 'Master bed wardrobe', siteDate: day(-1), review: { state: 'IN_REVIEW', submittedAt: Date.now() - 3 * DAY } }];
    setup({ conversations: CONVS });
    pick(/^Design/);
    fireEvent.click(screen.getByRole('button', { name: 'Nudge' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reminded' })).toBeTruthy());
    expect(desk.nudgeHolder).toHaveBeenCalled();
    cleanup();
    setup({ conversations: CONVS, isReviewer: true });
    pick(/^Design/);
    expect(screen.queryByRole('button', { name: 'Nudge' })).toBeNull();
  });

  it("says where this week's update stands in Client & portal, and opens the Ops Desk to act on it", () => {
    smart.care = { care: null, digest: { status: 'pending_review', preparedByName: 'Mayuri' }, meetings: null };
    const { onLeaveProject } = setup({ conversations: CONVS, seesClientCare: true, projectContext: { name: 'Palacia 3BHK', status: 'won' } });
    pick(/^Client & portal/);
    const card = screen.getByRole('region', { name: 'This week’s update' });
    expect(card.textContent).toContain('waiting for approval');
    expect(card.textContent).toContain('Written by Mayuri');
    fireEvent.click(within(card).getByRole('button', { name: 'Open the Ops Desk' }));
    expect(onLeaveProject).toHaveBeenCalledWith('ops-desk');
  });

  it('shows the client pulse with its reasons and opens this client in Clients', () => {
    smart.care = { care: { followUps: [{ id: 'f', projectId: 'p1', at: Date.now() - DAY, channel: 'call', outcome: 'replied', note: 'Mood: Happy.', by: 'x', byName: 'Asha' }], escalations: [], decisions: [], moms: [], visits: [], checklists: {} }, digest: null, meetings: null };
    const { onLeaveProject } = setup({ conversations: CONVS, seesClientCare: true, projectContext: { name: 'Palacia 3BHK', status: 'execution' } });
    const card = screen.getByRole('complementary', { name: 'Project card' });
    expect(card.textContent).toContain('Client pulse');
    expect(card.textContent).toContain('Heard from them');
    expect(card.textContent).toContain('Handover checklist');
    fireEvent.click(within(card).getByRole('button', { name: 'Open in Clients' }));
    expect(sessionStorage.getItem('ffds_clients_open')).toBe('p1');
    expect(onLeaveProject).toHaveBeenCalledWith('clients');
  });

  it('shows no pulse, update or checklist to a role that cannot open the Ops Desk', () => {
    smart.care = { care: null, digest: undefined, meetings: null };
    setup({ conversations: CONVS, projectContext: { name: 'Palacia 3BHK', status: 'execution' } });
    const card = screen.getByRole('complementary', { name: 'Project card' });
    expect(card.textContent).not.toContain('Client pulse');
    expect(card.textContent).not.toContain('Handover checklist');
  });
});

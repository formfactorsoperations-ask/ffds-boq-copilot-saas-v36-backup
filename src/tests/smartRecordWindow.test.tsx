/*
  Smart Record on screen (smart workspace, PR 3; owner, 27 Nov 2026): notes
  read into kinds, ticked, and filed where the studio keeps each; extra work
  checked against the BOQ and the Item bank, then drafted as a scope addition.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

vi.mock('../../services/firebaseClient', () => ({ db: null, auth: null, storage: null, functions: null, isFirebaseConfigured: () => false }));
const ai = vi.hoisted(() => ({
  readNotes: vi.fn(async () => ({
    summary: 'Walked the site. Living layout agreed.',
    items: [
      { id: 'n0', kind: 'decision', text: 'Living room layout approved', room: 'Living Room', due: null, category: 'Client Request', severity: null, selected: true },
      { id: 'n1', kind: 'snag', text: 'Hall ceiling 20 mm off level', room: 'Hall', due: null, category: null, severity: 'high', selected: true },
      { id: 'n2', kind: 'extra_work', text: 'Pooja unit in the passage', room: null, due: null, category: null, severity: null, selected: true },
      { id: 'n3', kind: 'client_promise', text: 'Pay the balance by Friday', room: null, due: '2026-11-29', category: null, severity: null, selected: true },
    ],
  })),
  blobToBase64: vi.fn(async () => ''),
  assistAvailable: () => true,
}));
vi.mock('../../services/opsAssistService', () => ai);
const desk = vi.hoisted(() => ({
  logFollowUp: vi.fn(async (f: any) => ({ id: 'x', ...f, at: Date.now() })),
  raiseEscalation: vi.fn(async () => ({ id: 'e' })),
}));
vi.mock('../../services/opsDeskService', () => desk);
const decisions = vi.hoisted(() => ({ saveDecision: vi.fn(async () => 'd1') }));
vi.mock('../../services/decisionsService', () => decisions);

import SmartRecord, { type SmartRecordProps } from '../../components/projectConversations/SmartRecord';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const BANK: any[] = [{ id: 'b1', name: 'Pooja Unit', unit: 'nos', materials: 30000, labor: 8000, margin: 20 }];

function setup(over: Partial<SmartRecordProps> = {}) {
  const props: SmartRecordProps = {
    projectId: 'p1', projectName: 'Palacia 3BHK', clientName: 'Mrs. Mehta', tenantId: 't1', me: { email: 'owner@studio.in', name: 'Owner' },
    rooms: ['Living Room', 'Hall'], raisedBy: 'owner', onAddSnags: vi.fn(), canPrice: true, seesRates: true,
    boq: [{ id: 'l1', name: 'TV Unit' }], bank: BANK, canOpen: () => true, onOpen: vi.fn(), onDraftScope: vi.fn(), onLogged: vi.fn(), onClose: vi.fn(),
    ...over,
  };
  render(<SmartRecord {...props} />);
  return props;
}

const readIt = async () => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'client ok with living layout. wants pooja unit in passage. hall ceiling off.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
  await screen.findByRole('region', { name: 'Decisions' });
};

describe('Smart Record', () => {
  it('reads the notes into kinds, each saying where it goes, with the room the project calls it', async () => {
    setup();
    await readIt();
    expect(ai.readNotes).toHaveBeenCalledWith({ text: expect.stringContaining('pooja unit') }, expect.any(String), { clientName: 'Mrs. Mehta', source: 'Site visit', rooms: ['Living Room', 'Hall'] });
    expect(screen.getByRole('region', { name: 'Decisions' }).textContent).toContain('A draft on Record Decision');
    expect(screen.getByRole('region', { name: 'Snags' }).textContent).toContain('Hall');
    expect(screen.getByRole('button', { name: 'File 4 items' })).toBeTruthy();
  });

  it('checks extra work against the BOQ and the Item bank, with the rate behind the eye', async () => {
    setup();
    await readIt();
    const extra = screen.getByRole('region', { name: 'Possible extra work' });
    expect(extra.textContent).toContain('Not in the BOQ by name.');
    expect(extra.textContent).toContain('From your Item bank: Pooja Unit');
    expect(extra.textContent).toMatch(/₹[\d,]+ per nos/);
  });

  it('files only what is ticked, each where the studio keeps it, then offers to draft the extra work', async () => {
    const props = setup();
    await readIt();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pay the balance by Friday' }));
    fireEvent.click(screen.getByRole('button', { name: 'File 3 items' }));
    await screen.findByText('Filed');
    expect(desk.logFollowUp).toHaveBeenCalledTimes(1); // the visit itself; the unticked promise is not filed
    expect(decisions.saveDecision).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Living room layout approved', roomName: 'Living Room', category: 'Client Request' }));
    expect(props.onAddSnags).toHaveBeenCalledWith([expect.objectContaining({ roomName: 'Hall', severity: 'high', status: 'open', raisedBy: 'owner' })]);
    expect(desk.raiseEscalation).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('region', { name: 'Possible extra work' })).getByRole('button', { name: 'Draft scope addition' }));
    expect(props.onDraftScope).toHaveBeenCalledWith('Pooja unit in the passage');
  });

  it('sends extra work to the leads when this person cannot price it, and leaves snags alone when they cannot change the project', async () => {
    setup({ canPrice: false, onAddSnags: undefined });
    await readIt();
    expect(screen.getByRole('checkbox', { name: 'Hall ceiling 20 mm off level' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'File 3 items' }));
    await screen.findByText('Filed');
    expect(desk.raiseEscalation).toHaveBeenCalledWith(expect.objectContaining({ title: 'Extra work asked for: Pooja unit in the passage', category: 'scope' }));
    expect(screen.queryByRole('button', { name: 'Draft scope addition' })).toBeNull();
  });

  it('leaves decisions unticked for a role that cannot open Record Decision', async () => {
    setup({ canOpen: (r) => r !== 'record-decision' });
    await readIt();
    expect(screen.getByRole('checkbox', { name: 'Living room layout approved' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('region', { name: 'Decisions' }).textContent).toContain('Your role cannot record decisions');
    fireEvent.click(screen.getByRole('button', { name: 'File 3 items' }));
    await screen.findByText('Filed');
    expect(decisions.saveDecision).not.toHaveBeenCalled();
  });

  it('needs some notes before it reads, and closes on Esc', () => {
    const props = setup();
    expect(screen.getByRole('button', { name: 'Read it' })).toHaveProperty('disabled', true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });
});

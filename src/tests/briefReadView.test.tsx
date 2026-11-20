/*
  Brief & Site opens as a read of the brief (option C, components/brief/BriefReadView):
  the client's words and how they were read, the client's floor plan with a way to
  add it, what is missing with the floor plan first, and each part editable in place.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't1' }, teamMembers: [], currentUserAuth: { email: 'o@x.test' }, currentRole: 'Owner', currentRoles: ['Owner'] }),
}));
vi.mock('../../services/firebaseClient', () => ({ db: null, functions: null, auth: null, storage: null }));
vi.mock('../../services/minutesService', () => ({ projectMinutes: vi.fn(async () => []), markFiled: vi.fn() }));
vi.mock('../../services/geminiService', () => ({ isAiAvailable: () => false, estimateRoomSizes: vi.fn(async () => []) }));
const upload = vi.fn(async () => 'https://x/o/studios%2Ft1%2Fplans%2F1.jpg?alt=media');
vi.mock('../../services/planStorage', () => ({ uploadPlanImage: (...a: any[]) => (upload as any)(...a) }));
vi.mock('../../lib/imageDownscale', () => ({ downscalePlanToBase64: vi.fn(async () => '/9j/AAAA') }));
vi.mock('../../services/planImage', () => ({ planImageFromFile: vi.fn(async () => '/9j/IMG'), planImageFromUrl: vi.fn(async () => '/9j/URL') }));
const readPlan = vi.fn(async () => ({
  rooms: [{ name: 'Master Bedroom', size: 120, unit: 'sq ft' }, { name: 'Bedroom 2', size: 77, unit: 'sq ft' }, { name: 'Living & Dining', size: 220, unit: 'sq ft' }, { name: 'Civil', size: 0, unit: 'sq ft' }],
  area: 417, config: '2-BHK', read: 3,
}));
vi.mock('../../services/planRooms', () => ({ readRoomsFromPlan: (...a: any[]) => (readPlan as any)(...a) }));

import BriefReadView from '../../components/brief/BriefReadView';

const base: any = {
  name: 'Priya Rao · Powai', clientName: 'Priya Rao', clientPhone: '+91 98765 11111', area: 1100, config: '3-BHK',
  theme: 'modern', propertyStatus: 'raw_shell', location: 'Powai',
  clientBrief: 'New flooring in the living room. Redo the two bathrooms.',
  rooms: [{ name: 'Living', size: 220, unit: 'sq ft' }], designFeeType: 'percentage', designFee: 10,
};

function Harness({ ctx0, probe }: { ctx0: any; probe?: (c: any) => void }) {
  const [ctx, setCtx] = useState<any>(ctx0);
  probe?.(ctx);
  return <BriefReadView projectContext={ctx} setProjectContext={setCtx} projectId="p1" />;
}

afterEach(() => { cleanup(); upload.mockClear(); readPlan.mockClear(); });

describe('Brief & Site, read first', () => {
  it('reads the client’s words back and says how each switch was read', () => {
    render(<Harness ctx0={base} />);
    expect(screen.getByText('What Priya told us')).toBeTruthy();
    expect(screen.getByText('“New flooring in the living room. Redo the two bathrooms.”')).toBeTruthy();
    expect(screen.getByText('from “New flooring in the living room”')).toBeTruthy();
  });

  it('asks for the floor plan first when there is none, and saves one when it is uploaded', async () => {
    let c: any = null;
    render(<Harness ctx0={base} probe={x => { c = x; }} />);
    expect(screen.getByText('No floor plan from the client yet')).toBeTruthy();
    const needed = screen.getByText('Needed to go ahead').parentElement as HTMLElement;
    expect(within(needed).getAllByRole('button')[0].textContent).toBe('Floor plan');

    const input = screen.getByLabelText('Upload the client’s floor plan') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'plan.jpg', { type: 'image/jpeg' })] } }); });
    expect(upload).toHaveBeenCalledWith('t1', '/9j/AAAA');
    expect(c.floorplanImageUrl).toBe('https://x/o/studios%2Ft1%2Fplans%2F1.jpg?alt=media');
    expect(screen.getByRole('img', { name: 'The client’s floor plan' })).toBeTruthy();
    expect(screen.queryByText('Needed to go ahead')).toBeNull();
  });

  it('shows a plan the client already gave, with a way to open it full size', () => {
    render(<Harness ctx0={{ ...base, floorplanImageUrl: 'https://x/o/p.pdf?alt=media' }} />);
    expect(screen.getByText('The plan is a PDF')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open full size/ }).getAttribute('href')).toBe('https://x/o/p.pdf?alt=media');
  });

  it('opens one part of the form in place, and closes it with Done', () => {
    let c: any = null;
    render(<Harness ctx0={base} probe={x => { c = x; }} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const area = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(area.value).toBe(base.clientBrief);
    fireEvent.change(area, { target: { value: 'Only the kitchen.' } });
    expect(c.clientBrief).toBe('Only the kitchen.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getByText('“Only the kitchen.”')).toBeTruthy();
  });

  it('reads the rooms off a first plan straight away, and sets the area and the BHK', async () => {
    let c: any = null;
    render(<Harness ctx0={{ ...base, rooms: [], area: 0, config: '' }} probe={x => { c = x; }} />);
    const input = screen.getByLabelText('Upload the client’s floor plan') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'plan.pdf', { type: 'application/pdf' })] } }); });
    expect(readPlan).toHaveBeenCalledTimes(1);
    expect((readPlan.mock.calls[0] as any[])[0]).toBe('/9j/IMG');
    expect(c.rooms.map((r: any) => r.name)).toContain('Master Bedroom');
    expect(c.area).toBe(417);
    expect(c.config).toBe('2-BHK');
    expect(screen.getByText(/Read 3 rooms off the plan/)).toBeTruthy();
  });

  it('asks before replacing rooms that are already there', async () => {
    let c: any = null;
    render(<Harness ctx0={{ ...base, floorplanImageUrl: 'https://x/o/p.jpg?alt=media' }} probe={x => { c = x; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read the rooms again' }));
    expect(readPlan).not.toHaveBeenCalled();
    expect(screen.getByText(/This replaces the 1 room in the list/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Replace with the plan’s rooms' })); });
    expect((readPlan.mock.calls[0] as any[])[0]).toBe('/9j/URL');
    expect(c.rooms.length).toBe(4);
  });
});

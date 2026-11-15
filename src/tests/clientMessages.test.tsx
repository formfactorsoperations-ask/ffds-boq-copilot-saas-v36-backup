/*
  Client Comms is retired. What the client writes from their portal is kept,
  on a slim Messages screen, and the Ops Matrix no longer points at the
  retired tracker.
*/
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import ClientMessagesPage, { unansweredMessages } from '../../components/ops/ClientMessagesPage';
import { ALWAYS_ON_BAND } from '../../components/navConfig';
import { JOURNEY_STEPS } from '../../constants/journeyConstants';

afterEach(cleanup);

const MESSAGES = [
  { id: 'm1', text: 'Can we move the site visit to Saturday?', sentAt: '2026-11-10T10:00:00.000Z', sentBy: 'Mrs Naik', readAt: null },
  { id: 'm2', text: 'Thanks for the 3D views.', sentAt: '2026-11-08T09:00:00.000Z', sentBy: 'Mr Naik', readAt: '2026-11-08T12:00:00.000Z', readBy: 'Anish K' },
];

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [ctx, setCtx] = useState<any>({ name: 'Harmony 704', clientMessages: MESSAGES });
  return (
    <>
      <ClientMessagesPage projectContext={ctx} setProjectContext={setCtx} currentUserName="Anish K" readOnly={readOnly} />
      <output data-testid="open">{unansweredMessages(ctx)}</output>
    </>
  );
}

describe('Client Messages', () => {
  it('lists the client\'s portal messages, unanswered first', () => {
    render(<Harness />);
    expect(screen.getByText('From the client')).toBeTruthy();
    expect(screen.getByText('1 unanswered')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Saturday');
    expect(items[1].textContent).toContain('Dealt with by Anish K');
  });

  it('marks a message dealt with, stamped with who did it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Mark dealt with'));
    expect(screen.getByTestId('open').textContent).toBe('0');
    expect(screen.getByText('All dealt with')).toBeTruthy();
    expect(screen.getAllByText(/Dealt with by Anish K/)).toHaveLength(2);
  });

  it('is read-only for roles that only read the project', () => {
    render(<Harness readOnly />);
    expect(screen.queryByText('Mark dealt with')).toBeNull();
  });

  it('says so when there are no messages yet', () => {
    render(<ClientMessagesPage projectContext={{} as any} currentUserName="Anish K" />);
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });
});

describe('Client Comms is retired', () => {
  it('the Project Hub shows Messages, badged with unanswered client messages', () => {
    const item = ALWAYS_ON_BAND.find((i) => i.route === 'comms-tracker')!;
    expect(item.label).toBe('Messages');
    expect(ALWAYS_ON_BAND.some((i) => i.label === 'Client Comms')).toBe(false);
    expect(item.statusBadge!({ clientMessages: MESSAGES } as any)).toBe('1 new');
    expect(item.statusBadge!({ commsSummary: { pendingCount: 24 } } as any)).toBeNull();
  });

  it('no Ops Matrix step sends the studio to the retired tracker', () => {
    expect(JOURNEY_STEPS.filter((s: any) => s.linkedTab === 'comms-tracker')).toEqual([]);
    const notified = JOURNEY_STEPS.find((s: any) => s.id === 'exec_start_notified') as any;
    expect(notified.statusSource).toBe('manual');
  });
});

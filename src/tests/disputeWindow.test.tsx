/*
  The dispute card on Money is short, and the dispute opens in a window that
  can be closed again: to read a closed one, to reopen it, to edit it, to
  settle it. Reopening keeps the window on the dispute, now open.
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DisputePanel from '../../components/disputes/DisputePanel';
import ProjectAlertBar from '../../components/projectAlerts/ProjectAlertBar';
import { applyTermination, computeSettlement, isTerminated } from '../../lib/termination';
import { importDispute, disputesOf, openDispute } from '../../lib/disputes';

const schedule: any = { byId: { e4: { owed: 375308, invoiceTotal: 375308 }, d4: { owed: 102422, invoiceTotal: 102422 } } };
const settledProject = () => importDispute({
  name: 'Siesta 2BHK', status: 'completed',
  paymentMilestones: [{ id: 'e4', type: 'execution', name: 'Completion', status: 'invoiced' }, { id: 'd4', type: 'design', name: 'Final', status: 'invoiced' }],
}, {
  title: 'Units not built to the drawings', raisedBy: 'client', openedOn: '2026-05-15', claimed: { execution: 375308, design: 102422 },
  issues: [{ title: 'Kitchen loft', ref: 'BOQ 12', billed: 89100, claimed: 64100 }],
  positions: [{ on: '2026-06-03', by: 'client', note: 'Deductions on five lines', amount: 276407 }],
  status: 'settled', resolution: { on: '2026-06-22', settled: { execution: 200000, design: 77459 }, reason: 'Closure', withoutAdmission: true },
}, 'Owner');

let latest: any = null;
const Money: React.FC<{ start: any; canAct?: boolean }> = ({ start, canAct = true }) => {
  const [ctx, setCtx] = useState<any>(start);
  latest = ctx;
  return (
    <>
      {/* The strip under the project header, then Money's foot card: as the app lays them out. */}
      <ProjectAlertBar context={ctx} setProjectContext={(fn) => setCtx(fn)} role={canAct ? 'Owner' : 'Designer'} actor="Owner" />
      <DisputePanel context={ctx} schedule={schedule} canAct={canAct} actor="Owner" setProjectContext={(fn) => setCtx(fn)} />
    </>
  );
};

describe('the dispute window', () => {
  it('a closed dispute is a row on Money; View opens it in a window that closes again', () => {
    render(<Money start={settledProject()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Units not built to the drawings')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    const win = screen.getByRole('dialog', { name: 'Dispute' });
    expect(within(win).getByText('Kitchen loft')).toBeTruthy();
    expect(within(win).getByText('Deductions on five lines')).toBeTruthy();
    expect(within(win).getByText('Settled at')).toBeTruthy();
    /* Closed: nothing to settle or edit, only to reopen. */
    expect(within(win).queryByRole('button', { name: 'Settle dispute' })).toBeNull();
    expect(within(win).queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(within(win).getByRole('button', { name: 'Close window' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reopening asks first, then keeps the window on the dispute, now open and editable', () => {
    render(<Money start={settledProject()} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen dispute' }));
    expect(disputesOf(latest)[0].status).toBe('settled'); // asked, not done
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen dispute' }));
    expect(openDispute(latest)).not.toBeNull();
    const win = screen.getByRole('dialog', { name: 'Dispute' });
    expect(within(win).getByRole('button', { name: 'Settle dispute' })).toBeTruthy();
    /* Edit is a window of its own, and comes back to the dispute. */
    fireEvent.click(within(win).getByRole('button', { name: 'Edit' }));
    const edit = screen.getByRole('dialog', { name: 'Edit dispute' });
    fireEvent.click(within(edit).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Dispute' })).toBeTruthy();
  });

  it('an open dispute is a strip under the project header; it is settled in the window, which then closes', () => {
    const c = settledProject();
    render(<Money start={{ ...c, disputes: [{ ...c.disputes[0], status: 'open', resolution: null, closedOn: null }] }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Kitchen loft')).toBeNull(); // the detail is not on the screen itself
    expect(screen.getByText('Payment dispute')).toBeTruthy();
    expect(screen.getByText(/4,77,730 held back/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open dispute' }));
    const win = screen.getByRole('dialog', { name: 'Dispute' });
    fireEvent.click(within(win).getByRole('button', { name: 'Settle dispute' }));
    fireEvent.change(within(win).getByLabelText(/Execution settled at/), { target: { value: '200000' } });
    fireEvent.change(within(win).getByLabelText(/Design fee settled at/), { target: { value: '77459' } });
    const settle = within(win).getAllByRole('button', { name: 'Settle dispute' });
    fireEvent.click(settle[settle.length - 1]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(disputesOf(latest)[0].status).toBe('settled');
    expect(disputesOf(latest)[0].resolution.concession).toEqual({ execution: 175308, design: 24963 });
    expect(screen.queryByRole('button', { name: 'Open dispute' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
  });

  it('someone who cannot act can read a closed dispute but not reopen it', () => {
    render(<Money start={settledProject()} canAct={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Reopen dispute' })).toBeNull();
  });
});

describe('the strip under the project header', () => {
  const inputs = { designGross: 236000, executionGross: 1180000, designTaxable: 200000, executionTaxable: 1000000, collected: 118000, invoicedUnpaid: 0, suggestedDesignPct: 50, suggestedExecutionPct: 0 };
  const terminatedProject = () => applyTermination({ name: 'Sea View', status: 'won', lifecycle: { stage: 4 }, paymentMilestones: [] }, {
    reason: 'agreement_not_signed', note: 'No reply to two reminders', effectiveOn: '2026-11-20', actor: 'Owner',
    settlement: computeSettlement(inputs, { basis: 'prorata', designDonePct: 25, executionDonePct: 0, charges: 0 }),
  });

  it('draws nothing on a project that is neither terminated nor in dispute', () => {
    const { container } = render(<ProjectAlertBar context={{ name: 'Sea View', status: 'won' }} role="Owner" actor="Owner" />);
    expect(container.textContent).toBe('');
  });

  it('says a project is terminated, with the refund due, and opens the settlement in a window', () => {
    render(<Money start={terminatedProject()} />);
    expect(screen.getByText('Project terminated')).toBeTruthy();
    expect(screen.getByText(/Refund due to the client: ₹\s?59,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View settlement' }));
    const win = screen.getByRole('dialog', { name: 'Termination settlement' });
    fireEvent.click(within(win).getByRole('button', { name: 'Record refund paid' }));
    fireEvent.click(within(win).getByRole('button', { name: 'Save refund paid' }));
    expect(latest.termination.settlement.status).toBe('settled');
    expect(screen.getByText(/Refund paid to the client/)).toBeTruthy();
    /* Reopening asks first, then puts the project back and the strip goes. */
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen project' }));
    expect(isTerminated(latest)).toBe(true);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reopen project' }));
    expect(isTerminated(latest)).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Project terminated')).toBeNull();
  });

  it('someone who does not see the studio\'s money is told, without the amounts or the window', () => {
    render(<Money start={terminatedProject()} canAct={false} />);
    expect(screen.getByText('Project terminated')).toBeTruthy();
    expect(screen.queryByText(/59,000/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'View settlement' })).toBeNull();
  });
});

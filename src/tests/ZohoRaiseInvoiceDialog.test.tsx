import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const zoho = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../services/zohoBooksService', () => ({ zohoCall: zoho.call, ZohoCallError: class extends Error {} }));
vi.mock('../../contexts/OrgContext', () => ({ useOrg: () => ({ orgData: { tenantId: 't1', gstin: '27CNTPP7302Q1Z0' } }) }));

import ZohoRaiseInvoiceDialog from '../../components/ZohoRaiseInvoiceDialog';

const INV = { id: 'Z25', number: 'INV-26/27-0025', status: 'draft', total: 50071, balance: 50071, date: '2026-11-15', customerId: 'C-NJ', url: 'https://books.zoho.in/x' };

const setup = (onRaised = vi.fn()) => {
  render(
    <ZohoRaiseInvoiceDialog
      milestone={{ id: 'M1', name: 'Sign-up & Concept', type: 'design' } as any}
      amounts={{ taxable: 42433, gst: 7638, gstRatePct: 18, retainer: 0, discount: 0, invoiceTotal: 50071 }}
      projectId="P1"
      projectName="Palacia - 3BHK"
      client={{ name: 'Mrs. Nivedita Jamnis' }}
      billing={{ zohoContactId: 'C-NJ', zohoContactName: 'Mrs. Nivedita Jamnis', placeOfSupply: 'MH' }}
      onRaised={onRaised}
      onClose={vi.fn()}
    />,
  );
  return onRaised;
};

beforeEach(() => { cleanup(); zoho.call.mockReset(); });

describe('Raise invoice in Zoho Books: linking one already raised', () => {
  it("lists the customer's Zoho invoices and links the one picked", async () => {
    zoho.call.mockImplementation(async (action: string) => {
      if (action === 'listInvoices') return { invoices: [INV] };
      if (action === 'linkInvoice') return { invoiceId: 'Z25', invoiceNumber: INV.number, status: 'draft', total: 50071, expectedTotal: 50071, url: INV.url, reused: false, gstLabel: '', placeOfSupply: '', linked: true, invoiceDate: '2026-11-15T06:30:00.000Z' };
      throw new Error(action);
    });
    const onRaised = setup();

    fireEvent.click(screen.getByRole('tab', { name: 'Already in Zoho' }));
    await screen.findByText(INV.number);
    expect(zoho.call).toHaveBeenCalledWith('listInvoices', { contactId: 'C-NJ' }, 't1');

    fireEvent.click(screen.getByText(INV.number));
    fireEvent.click(screen.getByRole('button', { name: `Link ${INV.number}` }));

    await screen.findByText(/Nothing was changed in Zoho Books/);
    expect(zoho.call).toHaveBeenCalledWith('linkInvoice', { projectId: 'P1', milestoneId: 'M1', contactId: 'C-NJ', invoiceId: 'Z25', expectedTotal: 50071 }, 't1');
    expect(onRaised).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: INV.number, invoiceDate: '2026-11-15T06:30:00.000Z' }), expect.objectContaining({ zohoContactId: 'C-NJ' }));
    expect(zoho.call).not.toHaveBeenCalledWith('pushInvoice', expect.anything(), expect.anything());
  });

  it('warns when the picked invoice does not match the schedule', async () => {
    zoho.call.mockResolvedValue({ invoices: [{ ...INV, total: 45001 }] });
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Already in Zoho' }));
    fireEvent.click(await screen.findByText(INV.number));
    expect(screen.getByText(/Make sure it is the right invoice/)).toBeTruthy();
  });

  it('says so when the customer has no invoices in Zoho', async () => {
    zoho.call.mockResolvedValue({ invoices: [] });
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Already in Zoho' }));
    await waitFor(() => expect(screen.getByText(/Zoho has no invoices for Mrs\. Nivedita Jamnis yet/)).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Link invoice' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('still creates a new draft by default', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'New draft' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Create draft in Zoho' })).toBeTruthy();
  });
});

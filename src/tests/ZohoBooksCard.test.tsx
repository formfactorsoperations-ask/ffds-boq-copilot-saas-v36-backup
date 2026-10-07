import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const hook = vi.hoisted(() => ({ value: {} as any }));
vi.mock('../../hooks/useZohoBooks', () => ({ useZohoBooks: () => hook.value }));
vi.mock('../../services/zohoBooksService', () => ({ zohoCall: vi.fn() }));

import ZohoBooksCard from '../../components/studio/ZohoBooksCard';

const base = { unknown: false, loading: false, refresh: vi.fn(), setStatus: vi.fn(), tenantId: 't1' };

const open = () => fireEvent.click(screen.getByRole('button', { name: /Zoho Books/ }));

beforeEach(() => cleanup());

describe('Zoho Books settings card', () => {
  it('is a collapsed, optional section until opened', () => {
    hook.value = { ...base, status: { connected: false, canManage: true, canRaise: true } };
    render(<ZohoBooksCard />);
    expect(screen.getByText(/Optional · Off/)).toBeTruthy();
    expect(screen.queryByText(/Self Client/)).toBeNull();
  });

  it('walks an Owner or Admin through connecting', () => {
    hook.value = { ...base, status: { connected: false, canManage: true, canRaise: true } };
    render(<ZohoBooksCard />);
    open();
    expect(screen.getByText(/Self Client/)).toBeTruthy();
    expect(screen.getByText(/ZohoBooks\.invoices\.CREATE/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Zoho Books' })).toBeTruthy();
  });

  it('says the service is not deployed, rather than blaming the role', () => {
    hook.value = { ...base, status: { connected: false, canManage: false, canRaise: false, unavailable: true } };
    render(<ZohoBooksCard />);
    open();
    expect(screen.getByText(/not deployed for this project/)).toBeTruthy();
    expect(screen.getByText(/firebase deploy --only functions:zohoBooks/)).toBeTruthy();
    expect(screen.queryByText(/Only an Owner or Admin/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect Zoho Books' })).toBeNull();
  });

  it('tells a member without permission why they cannot connect', () => {
    hook.value = { ...base, status: { connected: false, canManage: false, canRaise: true } };
    render(<ZohoBooksCard />);
    open();
    expect(screen.getByText(/Only an Owner or Admin/)).toBeTruthy();
  });

  it('shows the connected organisation and the draft-only promise', () => {
    hook.value = {
      ...base,
      status: {
        connected: true, region: 'in', organizationName: 'Form Factors Design Studio', canManage: true, canRaise: true,
        settings: { numbering: { mode: 'zoho', template: '{FY}/' }, hsnDesign: '998391', hsnExecution: '998391', designItemName: 'Interior design services', executionItemName: 'Interior execution services', paymentTermsDays: null },
      },
    };
    render(<ZohoBooksCard />);
    expect(screen.getByText('Connected')).toBeTruthy();
    open();
    expect(screen.getByText(/never sent/)).toBeTruthy();
    // Named in the header line and again in the body.
    expect(screen.getAllByText('Form Factors Design Studio', { exact: false }).length).toBeGreaterThan(0);
  });
});

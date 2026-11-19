/*
  The studio icons in a project's page bar (components/projectNav/StudioJump):
  Design Desk, Ops Desk, People and the Item Bank, each only for the roles that
  open it, and a pick leaves the project for that screen.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import StudioJump, { studioJumpItems } from '../../components/projectNav/StudioJump';

afterEach(cleanup);

const labels = (role: any) => studioJumpItems(role).map((i) => i.label);

describe('Studio menu in the project page bar', () => {
  it('offers each desk only to the roles that open it', () => {
    expect(labels('Owner')).toEqual(['Design Desk', 'Ops Desk', 'People', 'Item Bank']);
    expect(labels('Super Admin')).toEqual(['Design Desk', 'Ops Desk', 'People', 'Item Bank']);
    expect(labels('Design Head')).toEqual(['Design Desk', 'People']);
    expect(labels('Designer')).toEqual(['Design Desk', 'People']);
    expect(labels('Client Relations')).toEqual(['Ops Desk', 'People']);
    expect(labels('Site Supervisor')).toEqual(['People']);
    // A Design Head who is also an Admin gets the Admin's desks too.
    expect(labels(['Admin', 'Design Head'])).toEqual(['Design Desk', 'Ops Desk', 'People', 'Item Bank']);
  });

  it('shows one icon per desk, each naming itself, and leaves the project for the one clicked', () => {
    const onGo = vi.fn();
    render(<StudioJump role="Owner" onGo={onGo} />);
    const nav = screen.getByRole('navigation', { name: 'Studio screens' });
    expect(within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Design Desk', 'Ops Desk', 'People', 'Item Bank']);
    fireEvent.mouseEnter(within(nav).getByRole('button', { name: 'Item Bank' }));
    expect(screen.getByRole('tooltip').textContent).toContain('Catalogue items, rates and packages');
    fireEvent.click(within(nav).getByRole('button', { name: 'Item Bank' }));
    expect(onGo).toHaveBeenCalledWith('admin-templates-bank');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows a Designer only the desks they open', () => {
    render(<StudioJump role="Designer" onGo={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Studio screens' });
    expect(within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Design Desk', 'People']);
  });

  it('draws nothing for a role with no desk to open', () => {
    const { container } = render(<StudioJump role="Vendor" onGo={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});

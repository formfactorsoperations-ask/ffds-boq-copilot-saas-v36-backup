/*
  The way back into a project from a studio screen (components/projectNav/BackToProject).
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BackToProject, { returnScreenLabel } from '../../components/projectNav/BackToProject';

afterEach(cleanup);

describe('Back to the project', () => {
  it('names the project and the screen that was left', () => {
    render(<BackToProject to={{ id: 'p1', tab: 'ops', name: 'Palacia – 3BHK' }} onBack={() => {}} onDismiss={() => {}} />);
    const back = screen.getByRole('button', { name: /Back to Palacia – 3BHK/ });
    expect(back.textContent).toContain(returnScreenLabel('ops'));
    expect(returnScreenLabel('dashboard')).toBe('Hub');
  });

  it('goes back on a click, and the × forgets it', () => {
    const onBack = vi.fn();
    const onDismiss = vi.fn();
    render(<BackToProject to={{ id: 'p1', tab: 'leadiq', name: 'Palacia' }} onBack={onBack} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /Back to Palacia/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Forget the way back' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('reads well for a project with no name', () => {
    render(<BackToProject to={{ id: 'p1', tab: 'unknown-route', name: '' }} onBack={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /Back to the project/ }).textContent).not.toContain('·');
  });
});

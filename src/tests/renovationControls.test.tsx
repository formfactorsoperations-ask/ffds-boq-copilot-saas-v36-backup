/*
  Where a renovation's timeline is set: the Brief asks whether the home is lived
  in during the work (a finished flat only), and Terms & Payment holds the
  studio's numbers (lib/renovation).
*/
import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ProjectContextCard from '../../components/ProjectContextCard';
import AnnexureEditor from '../../components/studio/AnnexureEditor';
import { OrgProvider } from '../../contexts/OrgContext';

describe('the Brief: during the work', () => {
  const Wrapper = ({ status }: { status: string }) => {
    const [ctx, setCtx] = useState<any>({ area: 700, rooms: [], propertyStatus: status });
    return (
      <OrgProvider>
        <ProjectContextCard projectContext={ctx} setProjectContext={setCtx} aiStrategy="balanced" only="site" />
        <div data-testid="lived">{String(!!ctx.livedInDuringWork)}</div>
      </OrgProvider>
    );
  };

  it('a finished flat asks Vacant or Lived in, and keeps the answer', () => {
    render(<Wrapper status="finished" />);
    const q = screen.getByRole('radiogroup', { name: 'During the work' });
    expect(within(q).getByRole('radio', { name: 'Vacant' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(q).getByRole('radio', { name: 'Lived in' }));
    expect(screen.getByTestId('lived').textContent).toBe('true');
    expect(screen.getByText(/it goes room by room around them, so the site work takes longer/)).toBeTruthy();
  });

  it('a raw shell or semi-finished flat does not ask', () => {
    render(<Wrapper status="semi_finished" />);
    expect(screen.queryByRole('radiogroup', { name: 'During the work' })).toBeNull();
  });
});

describe('Terms & Payment: a renovation’s timeline', () => {
  const Wrapper = () => {
    const [terms, setTerms] = useState<any>({});
    return (<><AnnexureEditor terms={terms} onChange={setTerms} /><div data-testid="saved">{JSON.stringify(terms.renovation || null)}</div></>);
  };

  it('shows the defaults, with a worked example, and saves a change', () => {
    render(<Wrapper />);
    expect((screen.getByLabelText('Strip-out: days per 100 sq ft') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Strip-out: at least (days)') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Strip-out: at most (days)') as HTMLInputElement).value).toBe('12');
    expect((screen.getByLabelText('Lived in: longer by (%)') as HTMLInputElement).value).toBe('25');
    expect(screen.getByText(/A 900 sq ft flat: 9 working days of strip-out; lived in, its site work takes 25% longer\./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Lived in: longer by (%)'), { target: { value: '30' } });
    expect(JSON.parse(screen.getByTestId('saved').textContent!)).toEqual({ stripOutPer100: 1, stripOutMin: 4, stripOutMax: 12, livedInPercent: 30 });
  });
});

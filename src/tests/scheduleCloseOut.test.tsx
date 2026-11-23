/*
  The chart offers to record a finished, back-dated programme as done on its
  planned dates (lib/schedule `closeOutAsPlanned`), and asks before it does.
*/
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScheduleGantt from '../../components/ScheduleGantt';
import { buildScheduleFromProject } from '../../lib/scheduleBuilder';
import { ProjectSchedule } from '../../types';

const programme = (startISO: string): ProjectSchedule => ({
  ...buildScheduleFromProject({} as any, [{ cat: 'Carpentry', qty: 1, materials: 900, labor: 100 }] as any, {
    designSteps: [{ stepNumber: 1, title: 'Concept', startDate: startISO, durationDays: 10 }],
  }),
  projectStartISO: startISO,
});

describe('Record a finished programme as completed', () => {
  it('marks every open stage done on its planned dates, after a confirm', () => {
    const onChange = vi.fn();
    const s = programme('2020-01-06');
    render(<ScheduleGantt schedule={s} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Record as completed' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `Mark ${s.tasks.length} done` }));

    const next: ProjectSchedule = onChange.mock.calls[0][0];
    expect(next.tasks.every(t => t.status === 'completed' && t.actualEndISO! < '2021-01-01')).toBe(true);
  });

  it('is not offered on a programme with work still ahead', () => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    render(<ScheduleGantt schedule={programme(d.toISOString().slice(0, 10))} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Record as completed' })).toBeNull();
  });
});

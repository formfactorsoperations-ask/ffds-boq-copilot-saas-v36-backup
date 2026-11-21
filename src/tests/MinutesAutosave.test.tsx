import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import MinutesReview from '../../components/minutes/MinutesReview';
import MinutesComposer from '../../components/minutes/MinutesComposer';
import type { MinutesContent } from '../../lib/minutes';

/*
  Closing the minutes must not lose what was being typed: a reviewer's notes,
  and a writer's last change, rough notes and half-typed point.
*/

const content = (): MinutesContent => ({
  topics: [{ id: 't1', title: 'Entrance', lines: [{ id: 'l1', kind: 'note', text: 'A drawer is required in the shoe cabinet.' }] }],
  summary: null, carried: [], nextMeeting: null, attendees: [], revisionNote: null,
});
const me = { email: 'anish@ffds.in', name: 'Anish' };

const review = (over: Partial<React.ComponentProps<typeof MinutesReview>> = {}) => (
  <MinutesReview content={content()} writtenBy="Anushka" queue={[]} me={me} keptKey="review:test:m1"
    onReturn={async () => undefined} onApprove={async () => undefined} onEdit={() => undefined} {...over} />
);
const composer = (over: Partial<React.ComponentProps<typeof MinutesComposer>> = {}) => (
  <MinutesComposer initial={content()} meeting={{ title: 'Design review', type: 'client_meeting', date: Date.now() }} people={[]}
    keptKey="write:test:m1" savedAt={0} onSave={async () => undefined} onNotesToPoints={async () => ({ topics: [], summary: '' })}
    onWriteBrief={async () => ''} onPreview={() => undefined} primary={() => null} {...over} />
);

describe('reviewing minutes', () => {
  beforeEach(() => { cleanup(); window.localStorage.clear(); });

  it('brings back notes, the note on the whole and a half-typed comment after closing', () => {
    render(review());
    fireEvent.click(screen.getByLabelText('Comment on this line'));
    fireEvent.change(screen.getByLabelText('Your note'), { target: { value: 'Say which drawer' } });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    fireEvent.click(screen.getByLabelText('Comment on this line'));
    fireEvent.change(screen.getByLabelText('Your note'), { target: { value: 'half a thought' } });
    cleanup();

    render(review());
    expect(screen.getAllByText(/Say which drawer/).length).toBeGreaterThan(0);
    expect((screen.getByLabelText('A note on the minutes as a whole') as HTMLTextAreaElement).value).toBe('Tighten the wording');
    expect((screen.getByLabelText('Your note') as HTMLInputElement).value).toBe('half a thought');
    expect(screen.getByText(/Your notes from last time are back/)).toBeTruthy();
    expect(screen.getByText(/Return with 2 notes/)).toBeTruthy();
  });

  it('says the notes are saved once something is typed, and says so when they are not', () => {
    render(review());
    expect(screen.queryByText('Saved')).toBeNull();
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    expect(screen.getByText('Saved')).toBeTruthy();

    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    try {
      fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording, please' } });
      expect(screen.getByText(/Not saved: this browser is not keeping your notes/)).toBeTruthy();
    } finally { full.mockRestore(); }
  });

  it('forgets them once the minutes are returned', async () => {
    const onReturn = vi.fn(async () => undefined);
    render(review({ onReturn }));
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    await act(async () => { fireEvent.click(screen.getByText(/Return with 1 note/)); });
    expect(onReturn).toHaveBeenCalledTimes(1);
    cleanup();
    render(review());
    expect((screen.getByLabelText('A note on the minutes as a whole') as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps them when returning fails', async () => {
    render(review({ onReturn: async () => { throw new Error('offline'); } }));
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    await act(async () => { fireEvent.click(screen.getByText(/Return with 1 note/)); });
    cleanup();
    render(review());
    expect((screen.getByLabelText('A note on the minutes as a whole') as HTMLTextAreaElement).value).toBe('Tighten the wording');
  });

  it('does not show one round\'s notes on another', () => {
    render(review());
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    cleanup();
    render(review({ keptKey: 'review:test:m1:later' }));
    expect((screen.getByLabelText('A note on the minutes as a whole') as HTMLTextAreaElement).value).toBe('');
  });
});

/* The database, as two devices signed in as the same person see it. */
const fakeCloud = () => {
  let held: any = null;
  return {
    read: vi.fn(async () => held),
    write: vi.fn(async (k: any) => { held = JSON.parse(JSON.stringify(k)); }),
    held: () => held,
  };
};
const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('reviewing minutes on another device', () => {
  beforeEach(() => { cleanup(); window.localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('brings the notes back on a device that has never seen them', async () => {
    const cloud = fakeCloud();
    render(review({ keptCloud: cloud }));
    await settle();
    fireEvent.click(screen.getByLabelText('Comment on this line'));
    fireEvent.change(screen.getByLabelText('Your note'), { target: { value: 'Say which drawer' } });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText(/on this device until/)).toBeTruthy();
    await settle(1100);
    expect(screen.getByText(/to your account, on any device/)).toBeTruthy();
    cleanup();

    window.localStorage.clear(); // another device
    render(review({ keptCloud: cloud }));
    await settle();
    expect(screen.getAllByText(/Say which drawer/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Your notes from last time are back/)).toBeTruthy();
  });

  it('sends what was typed when the window is closed at once', async () => {
    const cloud = fakeCloud();
    render(review({ keptCloud: cloud }));
    await settle();
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    cleanup();
    await settle();
    expect(cloud.held().value.general).toBe('Tighten the wording');
  });

  it('does not bring notes back from another device once the minutes are returned', async () => {
    const cloud = fakeCloud();
    render(review({ keptCloud: cloud }));
    await settle();
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    await settle(1100);
    const other = window.localStorage.getItem('ffds:minutes-kept:v1:review:test:m1'); // a second device still holding them
    await act(async () => { fireEvent.click(screen.getByText(/Return with 1 note/)); });
    await settle();
    cleanup();

    await settle(50);
    window.localStorage.setItem('ffds:minutes-kept:v1:review:test:m1', other!);
    render(review({ keptCloud: cloud }));
    await settle();
    expect((screen.getByLabelText('A note on the minutes as a whole') as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps what is typed here over an older copy in the database', async () => {
    const cloud = fakeCloud();
    await cloud.write({ value: { notes: [], general: 'old', lineId: null, line: '' }, at: Date.now() - 60000 });
    render(review({ keptCloud: cloud }));
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'newer' } });
    await settle(1100);
    expect((screen.getByLabelText('A note on the minutes as a whole') as HTMLTextAreaElement).value).toBe('newer');
    expect(cloud.held().value.general).toBe('newer');
  });

  it('carries on, on the device alone, when the database refuses', async () => {
    const cloud = { read: async () => { throw new Error('permission-denied'); }, write: async () => { throw new Error('permission-denied'); } };
    render(review({ keptCloud: cloud }));
    await settle();
    fireEvent.change(screen.getByLabelText('A note on the minutes as a whole'), { target: { value: 'Tighten the wording' } });
    await settle(1100);
    expect(screen.getByText(/on this device until/)).toBeTruthy();
  });
});

describe('writing minutes', () => {
  beforeEach(() => { cleanup(); window.localStorage.clear(); });

  it('saves the last change when closed before the save was due', async () => {
    const onSave = vi.fn(async (_c: MinutesContent) => undefined);
    render(composer({ onSave }));
    fireEvent.change(screen.getByDisplayValue('A drawer is required in the shoe cabinet.'), { target: { value: 'Two drawers.' } });
    expect(onSave).not.toHaveBeenCalled();
    cleanup();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].topics[0].lines[0].text).toBe('Two drawers.');
  });

  it('brings back a change that never reached the database, and saves it', async () => {
    vi.useFakeTimers();
    try {
      render(composer({ onSave: async () => { throw new Error('offline'); } }));
      fireEvent.change(screen.getByDisplayValue('A drawer is required in the shoe cabinet.'), { target: { value: 'Two drawers.' } });
      cleanup();
      await act(async () => { await Promise.resolve(); });

      const onSave = vi.fn(async (_c: MinutesContent) => undefined);
      render(composer({ onSave }));
      expect(screen.getByDisplayValue('Two drawers.')).toBeTruthy();
      expect(screen.getByText(/What you typed last time is back/)).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(onSave).toHaveBeenCalledTimes(1);
      cleanup();

      /* Stored now: the next opening shows the minutes as saved. */
      render(composer({ savedAt: Date.now() + 1 }));
      expect(screen.queryByText(/What you typed last time is back/)).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('does not bring back work older than the minutes as stored', () => {
    render(composer({ onSave: async () => { throw new Error('offline'); } }));
    fireEvent.change(screen.getByDisplayValue('A drawer is required in the shoe cabinet.'), { target: { value: 'Two drawers.' } });
    cleanup();
    render(composer({ savedAt: Date.now() + 60000 }));
    expect(screen.getByDisplayValue('A drawer is required in the shoe cabinet.')).toBeTruthy();
  });

  it('keeps rough notes and a half-typed point', () => {
    render(composer());
    fireEvent.change(screen.getByLabelText('Rough notes'), { target: { value: 'kitchen L shape ok' } });
    fireEvent.change(screen.getByLabelText('Add a point'), { target: { value: 'Client to send tile' } });
    cleanup();
    render(composer());
    expect((screen.getByLabelText('Rough notes') as HTMLTextAreaElement).value).toBe('kitchen L shape ok');
    expect((screen.getByLabelText('Add a point') as HTMLInputElement).value).toBe('Client to send tile');
  });

  it('brings rough notes back on another device', async () => {
    vi.useFakeTimers();
    try {
      const cloud = fakeCloud();
      render(composer({ roughCloud: cloud }));
      await settle();
      fireEvent.change(screen.getByLabelText('Rough notes'), { target: { value: 'kitchen L shape ok' } });
      await settle(1100);
      cleanup();
      window.localStorage.clear();
      render(composer({ roughCloud: cloud }));
      await settle();
      expect((screen.getByLabelText('Rough notes') as HTMLTextAreaElement).value).toBe('kitchen L shape ok');
    } finally { vi.useRealTimers(); }
  });
});

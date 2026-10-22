import React, { useEffect, useState } from 'react';
import { Video, UserPlus, LogIn, Check, Copy } from '@/lib/lucide-shim';
import {
  addCalendarAccount, activeCalendarAccount, calendarAccounts, onCalendarAccountsChange, setActiveCalendarAccount, GoogleCalendarError,
  type CalendarAccount,
} from '../../services/googleCalendarService';
import { Label, input, btnSm } from './OpsDeskPanels';

/*
  GOOGLE CALENDAR AND MEET ON THE OPS DESK (services/googleCalendarService).

  Any Google account can be signed in for the calendar, as many as the studio
  needs, without signing the app itself in as that account. A meeting is
  created from the account chosen, and its Meet link comes from that account.
  Built to DESIGN.md.
*/

export function useCalendarAccounts(): { list: CalendarAccount[]; active: string | null } {
  const [state, setState] = useState(() => ({ list: calendarAccounts(), active: activeCalendarAccount() }));
  useEffect(() => onCalendarAccountsChange(() => setState({ list: calendarAccounts(), active: activeCalendarAccount() })), []);
  return state;
}

/** What to tell the person when Google sign-in or the calendar says no. */
export function calendarError(e: any): string {
  if (e instanceof GoogleCalendarError) return e.message;
  const code = String(e?.code || '');
  if (code === 'auth/popup-blocked') return 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google sign-in was closed before it finished.';
  if (code === 'auth/unauthorized-domain') return "Google sign-in isn't allowed on this address yet. Ask the studio owner to add it under Firebase → Authentication → Settings → Authorized domains.";
  return "Google Calendar couldn't do that. Please try again.";
}

/** The account bar on Meetings & visits: which Google account new meetings go on, and a way to add another. */
export function CalendarAccountBar({ onError }: { onError: (m: string | null) => void }) {
  const { list, active } = useCalendarAccounts();
  const [busy, setBusy] = useState(false);
  const current = list.find((a) => a.email === active) || null;
  const signIn = async (hint?: string) => {
    onError(null);
    setBusy(true);
    try { await addCalendarAccount(hint); } catch (e) { onError(calendarError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
      <span className="w-8 h-8 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><Video className="w-4 h-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">Google Calendar and Meet</p>
        <p className="text-[11px] text-slate-500">
          {current
            ? `New meetings go on ${current.email}'s calendar, with a Meet link for video calls.${current.live ? '' : ' Sign in again to use it.'}`
            : 'Sign in with any Google account to put meetings on its calendar and create Meet links. The app stays signed in as you.'}
        </p>
      </div>
      {list.length > 1 && (
        <select aria-label="Calendar account" className={`${input} !w-auto max-w-[16rem]`} value={active || ''} onChange={(e) => setActiveCalendarAccount(e.target.value)}>
          {list.map((a) => <option key={a.email} value={a.email}>{a.email}{a.live ? '' : ' (sign in again)'}</option>)}
        </select>
      )}
      {current && !current.live && <button type="button" className={btnSm} disabled={busy} onClick={() => signIn(current.email)}><LogIn className="w-3.5 h-3.5" />Sign in again</button>}
      <button type="button" className={btnSm} disabled={busy} onClick={() => signIn()}>
        <UserPlus className="w-3.5 h-3.5" />{list.length ? 'Use another account' : 'Sign in with Google'}
      </button>
    </div>
  );
}

/**
 * The calendar step of booking, moving or cancelling a meeting. `fixed` is the
 * account an existing event is in: it can only be changed from there.
 */
export function CalendarStep({ id, on, onToggle, label, video, account, onAccount, fixed, guests, onGuests, onError }: {
  id: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  video: boolean;
  account: string;
  onAccount: (email: string) => void;
  fixed?: string | null;
  guests?: string;
  onGuests?: (v: string) => void;
  onError: (m: string | null) => void;
}) {
  const { list } = useCalendarAccounts();
  const [busy, setBusy] = useState(false);
  const known = list.find((a) => a.email === (fixed || account));
  const another = async () => {
    onError(null);
    setBusy(true);
    try { onAccount((await addCalendarAccount()).email); } catch (e) { onError(calendarError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hud-row-in">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 rounded border-slate-300 accent-[#3D52A0]" />
        {label}
      </label>
      {on && (fixed ? (
        <p className="text-[11px] text-slate-500">
          The event is on {fixed}'s calendar.{known?.live ? '' : ` Saving asks you to sign in to ${fixed}.`}
        </p>
      ) : (
        <>
          <div>
            <Label htmlFor={`${id}-account`}>Create it from</Label>
            <div className="flex flex-wrap items-center gap-2">
              {list.length ? (
                <select id={`${id}-account`} className={`${input} !w-auto flex-1 min-w-[12rem]`} value={account} onChange={(e) => onAccount(e.target.value)}>
                  {!account && <option value="">Choose a Google account</option>}
                  {list.map((a) => <option key={a.email} value={a.email}>{a.email}{a.live ? '' : ' (sign in again on save)'}</option>)}
                </select>
              ) : (
                <span className="text-xs text-slate-500 flex-1">No Google account signed in yet. Sign in now, or saving asks you to choose one.</span>
              )}
              <button type="button" className={btnSm} disabled={busy} onClick={another}><UserPlus className="w-3.5 h-3.5" />{list.length ? 'Use another account' : 'Sign in with Google'}</button>
            </div>
          </div>
          {onGuests && (
            <div>
              <Label htmlFor={`${id}-guests`}>Invite</Label>
              <input id={`${id}-guests`} className={input} placeholder="client@example.com, architect@example.com" value={guests || ''} onChange={(e) => onGuests(e.target.value)} />
              <p className="text-[11px] text-slate-500 mt-1">Google emails each guest the invite{video ? ' and the Meet link' : ''}. Leave it empty to only put it on the calendar.</p>
            </div>
          )}
        </>
      ))}
    </div>
  );
}

/** A Meet link to open or copy. */
export function MeetLinkRow({ url, onError }: { url: string; onError: (m: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { onError('Copying is blocked here. Select the link and copy it yourself.'); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-7 h-7 shrink-0 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><Video className="w-3.5 h-3.5" /></span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-sm font-semibold text-[#3D52A0] break-all hover:underline">{url}</a>
      <button type="button" className={btnSm} onClick={copy}>{copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, Check, Lock, Monitor, Moon, PlayCircle, Smartphone, UserCheck, Volume2, X } from '@/lib/lucide-shim';
import { type NoteArea, type NotifyPrefs, type QuietHours } from '../../lib/notify';
import { Glide, IconTile } from '../people/PeopleBits';
import { useInbox } from './NotifyContext';
import { askDesktop, chime, desktopPermission, showDesktop, type DesktopPermission } from './notifyChannels';
import { phoneState, platformName, turnPhoneOff, turnPhoneOn, type PhoneState } from './notifyPush';
import '../projectHeader/projectHeader.css';

/*
  WHAT REACHES YOU: each person's own settings (lib/notify.ts NotifyPrefs).

  The bell and the badges always get everything. These choose what may
  interrupt: the glass bar, a desktop alert when StudioDesk is behind another
  tab or app, a phone notification when StudioDesk is closed (on each device
  they turn it on for), a chime, and when to keep quiet. A blocked site and a
  client's dispute always get through. Saved beside the person's inbox, so the
  choice holds on every device; a change applies at once, with no Save button.

  A client in their portal sees only the two that make sense for them: alerts
  on this computer, and on their phone.
*/

const PHONE_BLURB: Record<PhoneState, string> = {
  on: 'On for this device. Someone waiting on you reaches it even with StudioDesk closed, outside your quiet hours.',
  off: 'A notification on this phone or computer even when StudioDesk is closed. Turn it on once on each device you use.',
  denied: 'Notifications are blocked for this site on this device. Allow them in the browser\'s site settings, then reopen this window.',
  install: 'On an iPhone, add StudioDesk to your Home Screen first: tap Share, then Add to Home Screen, and open it from there.',
  setup: 'Not set up for this studio yet. Your administrator adds the Web Push key once; until then the bar and the bell have everything.',
  unsupported: 'This browser cannot receive notifications when StudioDesk is closed. Chrome, Edge, Firefox and Safari can.',
};

const KINDS: { area: NoteArea; label: string; blurb: string }[] = [
  { area: 'clients', label: 'Clients', blurb: 'Messages, changes asked for, escalations, new enquiries' },
  { area: 'team', label: 'Team', blurb: 'Leave and corrections to decide' },
  { area: 'design', label: 'Design Desk', blurb: 'Sheets to review, sheets back with marks' },
  { area: 'site', label: 'Site', blurb: 'Blockers raised on site' },
];

const Switch: React.FC<{ on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, label, onChange, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-40 ${on ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
    <span className="block w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: on ? 'translateX(16px)' : undefined }} />
  </button>
);

const Section: React.FC<{ icon: React.ComponentType<any>; title: string; blurb: string; right?: React.ReactNode; children?: React.ReactNode; i: number }> =
  ({ icon, title, blurb, right, children, i }) => (
    <section className="group hud-row-in rounded-2xl border border-slate-200 p-4" style={{ animationDelay: `${i * 40}ms` }}>
      <div className="flex items-start gap-3">
        <IconTile icon={icon} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{blurb}</p>
        </div>
        {right}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );

export default function NotifySettings({ onClose }: { onClose: () => void }) {
  const inbox = useInbox();
  const [perm, setPerm] = useState<DesktopPermission>(() => desktopPermission());
  const [phone, setPhone] = useState<PhoneState | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const box = inbox?.box || null;
  useEffect(() => { let alive = true; phoneState(box).then((s) => { if (alive) setPhone(s); }); return () => { alive = false; }; }, [box]);
  const flipPhone = async (on: boolean) => {
    setPhoneBusy(true);
    try { setPhone(await (on ? turnPhoneOn(box) : turnPhoneOff(box))); } catch { setPhone(await phoneState(box)); }
    setPerm(desktopPermission());
    setPhoneBusy(false);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (!inbox) return null;
  const p = inbox.prefs;
  const set = (next: NotifyPrefs) => { inbox.setPrefs(next); setSavedAt(Date.now()); };
  const flip = (channel: 'bar' | 'desktop' | 'phone', area: NoteArea, v: boolean) => set({ ...p, [channel]: { ...p[channel], [area]: v } });
  const client = inbox.audience === 'client';
  const test = () => showDesktop({
    id: `test-${Date.now()}`, kind: 'client.message', area: 'clients', level: 'needs', title: 'Desktop alerts are on',
    line: 'This is how a note looks when StudioDesk is behind another window.', projectId: null, projectName: null,
    route: 'home', action: null, actor: 'StudioDesk', initials: 'SD', group: null, at: Date.now(), readAt: null, doneAt: null, snoozedUntil: null,
  }, () => {});

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="What reaches you">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Notifications</p>
            <h3 className="font-bold text-slate-800 mt-1">{client ? 'Alerts on this device' : 'What reaches you'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{client ? 'The bell always has everything the studio shares with you. These choose what may reach you outside the portal.' : 'The bell and the badges always get everything. These choose what may interrupt you.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          <Section i={0} icon={Monitor} title="Desktop alerts"
            blurb={perm === 'granted' ? 'On in this browser. They show only when StudioDesk is behind another tab or app.'
              : perm === 'denied' ? 'Blocked in this browser. Allow notifications for this site in the browser\'s site settings, then reopen this window.'
              : perm === 'unsupported' ? 'This browser cannot show desktop alerts. The bar and the bell still have everything.'
              : 'An alert from your computer when someone is waiting on you and StudioDesk is behind another tab or app. Your browser asks once.'}
            right={perm === 'default' ? (
              <button type="button" onClick={async () => setPerm(await askDesktop())} className="pp-press shrink-0 px-3 py-1.5 rounded-lg bg-[#3D52A0] text-white text-xs font-bold hover:bg-[#334486]">Turn on</button>
            ) : perm === 'granted' ? (
              <button type="button" onClick={test} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50">Send a test</button>
            ) : null} />

          <Section i={1} icon={Smartphone} title={phone === 'on' ? `Phone notifications · ${platformName()}` : 'Phone notifications'}
            blurb={phone ? PHONE_BLURB[phone] : 'Checking this device…'}
            right={phone === 'off' || phone === 'on' ? (
              <Switch on={phone === 'on'} label="Phone notifications on this device" disabled={phoneBusy} onChange={flipPhone} />
            ) : null} />

          {!client && <>
          <Section i={2} icon={BellRing} title="What may interrupt you" blurb="Only notes where someone is waiting on you. Updates are counted, never shown.">
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 sm:gap-x-4 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kind</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-12 sm:min-w-14 text-center whitespace-nowrap">The bar</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-12 sm:min-w-14 text-center whitespace-nowrap">Desktop</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-12 sm:min-w-14 text-center whitespace-nowrap">Phone</span>
              </div>
              <div className="divide-y divide-slate-100">
                {KINDS.map((k, i) => (
                  <div key={k.area} className="hud-row-in grid grid-cols-[1fr_auto_auto_auto] gap-x-1 sm:gap-x-4 items-center px-3 py-2.5" style={{ animationDelay: `${80 + i * 30}ms` }}>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{k.label}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{k.blurb}</span>
                    </span>
                    <span className="min-w-12 sm:min-w-14 flex justify-center"><Switch on={p.bar[k.area]} label={`${k.label} in the bar`} onChange={(v) => flip('bar', k.area, v)} /></span>
                    <span className="min-w-12 sm:min-w-14 flex justify-center"><Switch on={p.desktop[k.area]} label={`${k.label} as a desktop alert`} disabled={perm !== 'granted'} onChange={(v) => flip('desktop', k.area, v)} /></span>
                    <span className="min-w-12 sm:min-w-14 flex justify-center"><Switch on={p.phone[k.area]} label={`${k.label} on your phone`} disabled={phone !== 'on'} onChange={(v) => flip('phone', k.area, v)} /></span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5"><Lock className="w-3 h-3" />A blocked site and a client's dispute always reach you, at any hour.</p>
          </Section>

          <Section i={3} icon={Moon} title="Quiet hours" blurb="Nothing pops up, alerts, buzzes or chimes. Counts still change, so it is all there in the morning.">
            <Glide id="nt-quiet" label="Quiet hours" value={p.quiet} onChange={(v: QuietHours) => set({ ...p, quiet: v })}
              options={[{ id: 'off', label: 'Off' }, { id: 'night', label: '8 PM to 8 AM' }, { id: 'nightAndWeekend', label: 'Nights and weekends' }]} />
          </Section>

          <Section i={4} icon={Volume2} title="Sound" blurb="A soft chime when someone is waiting on you."
            right={<span className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={chime} className="inline-flex items-center gap-1 text-xs font-bold text-[#3D52A0] hover:underline"><PlayCircle className="w-3.5 h-3.5" />Play it</button>
              <Switch on={p.sound} label="Chime" onChange={(v) => set({ ...p, sound: v })} />
            </span>} />

          <Section i={5} icon={UserCheck} title="Check-ins" blurb="For team leads: which check-ins count on People and in the bell.">
            <Glide id="nt-checkins" label="Check-ins" value={p.checkins} onChange={(v: 'all' | 'exceptions') => set({ ...p, checkins: v })}
              options={[{ id: 'all', label: 'Every check-in' }, { id: 'exceptions', label: 'Only late and from home' }]} />
          </Section>
          </>}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
            {savedAt ? <><Check className="w-3.5 h-3.5 text-emerald-600" />Saved. It holds on every device you use.</> : 'Changes save as you make them, for every device you use.'}
          </span>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486]">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import type { Stored } from '../../lib/notify';

/*
  OUTSIDE THE PAGE: desktop alerts, the dot on the tab icon, and the chime.

  A desktop alert is the browser's own notification, shown only when
  StudioDesk is not the window in front (another tab, another app), so it
  never doubles the bar. The browser asks each person once, from the
  "What reaches you" window; nothing here asks on its own.
*/

export type DesktopPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function desktopPermission(): DesktopPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return (window as any).Notification.permission as DesktopPermission;
}

export async function askDesktop(): Promise<DesktopPermission> {
  if (desktopPermission() === 'unsupported') return 'unsupported';
  try { return (await (window as any).Notification.requestPermission()) as DesktopPermission; } catch { return desktopPermission(); }
}

/** Whether StudioDesk is the window in front, where the bar already shows. */
export const inFront = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

/** One desktop alert. Clicking it brings StudioDesk forward and opens the note. */
export function showDesktop(n: Stored, onClick: () => void): void {
  if (desktopPermission() !== 'granted') return;
  try {
    const alert = new (window as any).Notification(n.title, {
      body: [n.line, n.projectName].filter(Boolean).join(' · '),
      tag: n.id,
      icon: '/pwa-192x192.png',
      silent: true,
    });
    alert.onclick = () => { try { window.focus(); } catch { /* ignore */ } onClick(); alert.close(); };
  } catch {
    /* Some phone browsers only show notifications from a service worker; the bar and the bell still have it. */
  }
}

/* ── The dot on the tab's icon ───────────────────────────────────────────── */

let original: string | null = null;
let dotted: string | null = null;

async function dottedIcon(href: string): Promise<string | null> {
  if (dotted) return dotted;
  try {
    const svg = await (await fetch(href)).text();
    const inner = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    dotted = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image href="${inner}" xlink:href="${inner}" width="64" height="64"/><circle cx="50" cy="14" r="12" fill="#E11D48" stroke="#fff" stroke-width="4"/></svg>`,
    )}`;
    return dotted;
  } catch {
    return null;
  }
}

/** A rose dot on the tab's icon while anything is unread, so it shows from another tab. */
export async function setIconDot(on: boolean): Promise<void> {
  if (typeof document === 'undefined') return;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  if (original === null) original = link.getAttribute('href') || '/favicon.svg';
  if (!on) { link.setAttribute('href', original); return; }
  const next = await dottedIcon(original);
  if (next) link.setAttribute('href', next);
}

/* ── The chime ───────────────────────────────────────────────────────────── */

let audio: AudioContext | null = null;

/** Two soft notes, rising. Only when the person turned sound on. */
export function chime(): void {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audio = audio || new Ctx();
    const ctx = audio!;
    /* Browsers start audio paused until the page has been clicked once; ask it to resume. */
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    [[880, 0], [1320, 0.11]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.06, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.34);
    });
  } catch {
    /* No sound is the safe way to fail. */
  }
}

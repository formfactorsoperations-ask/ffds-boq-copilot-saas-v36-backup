/*
  WHICH STUDIODESK IS THIS, AND IS THERE A NEWER ONE.

  StudioDesk stays open all day, often as an installed app with no browser
  reload button, so a deploy only reached someone when they hard-refreshed.
  Each build now names itself (build.js writes the id into the bundle and into
  /version.json); the top bar asks /version.json now and then and, when the id
  there is not this page's, its refresh button says a new version is ready.

  The refresh itself clears what could hold an old copy: any service worker
  except the one that delivers phone notifications (components/notify/
  notifyPush.ts), and the browser's Cache Storage. Then it reloads.
*/

/** This page's build, or '' in dev, where there is nothing to compare. */
export const BUILD_ID: string = (() => {
  try { return String((import.meta as any).env?.VITE_BUILD_ID || ''); } catch { return ''; }
})();

/** The build the site serves now, or null when it cannot be asked (offline, dev). */
export async function latestBuild(): Promise<string | null> {
  if (!BUILD_ID) return null;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.build === 'string' && j.build ? j.build : null;
  } catch {
    return null;
  }
}

/** Whether `latest` is a different build from this page's. */
export const isNewer = (latest: string | null | undefined) => !!BUILD_ID && !!latest && latest !== BUILD_ID;

const PHONE_WORKER = 'firebase-messaging-sw';

/** Drop every cached copy of the app, keep phone notifications on, and load the page afresh. */
export async function hardRefresh(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs
        .filter((r) => !(r.active || r.waiting || r.installing)?.scriptURL.includes(PHONE_WORKER))
        .map((r) => r.unregister()));
    }
  } catch { /* nothing to unregister */ }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* nothing cached */ }
  window.location.reload();
}

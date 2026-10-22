import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseConfig } from '../services/firebaseConfig';

/*
  PHONE NOTIFICATIONS, WHEN STUDIODESK IS CLOSED (components/notify/notifyPush.ts).

  build.js bundles this to /firebase-messaging-sw.js. The server sends a
  data-only message for each "needs you" note (functions/src/notify.ts), so
  the words shown are the note's own and nothing else. When StudioDesk is open
  and in front, Firebase hands the message to the page instead, where the bar
  already shows it, and nothing is shown here. The tag is the note's id: a
  desktop alert from the page and this one replace each other, never stack.

  Tapping it brings an open StudioDesk forward and opens the note, or opens
  StudioDesk on it (?note=).
*/

/* The worker's own scope. Typed loosely: the app's tsconfig has the page's DOM types, not a worker's. */
declare const self: any;

const messaging = getMessaging(initializeApp(firebaseConfig));

onBackgroundMessage(messaging, (payload) => {
  const d = (payload.data || {}) as Record<string, string>;
  if (!d.title) return;
  return self.registration.showNotification(d.title, {
    body: d.body || '',
    tag: d.noteId || undefined,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { noteId: d.noteId || '' },
  });
});

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const noteId = String(event.notification.data?.noteId || '');
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = open.find((c: any) => new URL(c.url).origin === self.location.origin);
    if (mine) {
      await mine.focus();
      mine.postMessage({ type: 'studiodesk:open-note', noteId });
      return;
    }
    await self.clients.openWindow(noteId ? `/?note=${encodeURIComponent(noteId)}` : '/');
  })());
});

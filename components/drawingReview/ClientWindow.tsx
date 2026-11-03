import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/*
  THE CLIENT'S WINDOW, for a design meeting held online.

  Sharing the whole screen in a video call shows the client everything the
  presenter sees: the toolbar, the notes, the billing. Instead the presenter
  opens this second window and shares only it ("Share a window" in Google
  Meet, Zoom or Teams). It shows the room, the drawing and the changes the
  client asked for, nothing else, and it follows what the presenter does in
  the meeting: room, sheet, page, zoom, scroll, the pins as they are placed.

  It is a plain browser window of the app's own origin, so it is drawn by
  this React tree through a portal and shares its state; nothing is sent
  anywhere. The app's stylesheets are copied into it when it opens.
*/

const NAME = 'ffds-meeting-client';

/** Copies the app's styles (and the studio's font and theme) into the other window. */
function copyLook(from: Document, to: Document) {
  to.head.querySelectorAll('[data-ffds-copied]').forEach((n) => n.remove());
  from.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
    const c = n.cloneNode(true) as HTMLElement;
    c.setAttribute('data-ffds-copied', '');
    to.head.appendChild(c);
  });
  to.documentElement.className = from.documentElement.className;
  const style = from.documentElement.getAttribute('style');
  if (style) to.documentElement.setAttribute('style', style); else to.documentElement.removeAttribute('style');
  to.body.className = from.body.className;
}

export interface ClientWin {
  win: Window;
  root: HTMLElement;
  /** The window's inner size, kept up to date, so the drawing can be fitted to it. */
  size: { w: number; h: number };
}

/**
 * Opens, follows and closes the client's window. `open` must be called from
 * a click (browsers allow a new window only then); it returns false when the
 * browser blocked it.
 */
export function useClientWindow(title: string) {
  const [cw, setCw] = useState<ClientWin | null>(null);
  const ref = useRef<ClientWin | null>(null);
  ref.current = cw;

  const close = useCallback(() => {
    const w = ref.current?.win;
    setCw(null);
    try { if (w && !w.closed) w.close(); } catch { /* already gone */ }
  }, []);

  const open = useCallback((): boolean => {
    if (ref.current && !ref.current.win.closed) { ref.current.win.focus(); return true; }
    const w = window.open('', NAME, 'popup=yes,width=1280,height=800');
    if (!w) return false;
    const d = w.document;
    d.title = title;
    copyLook(document, d);
    d.body.innerHTML = '';
    d.body.style.margin = '0';
    d.body.style.background = '#EDEDE7';
    const root = d.createElement('div');
    root.id = 'ffds-client-root';
    d.body.appendChild(root);
    setCw({ win: w, root, size: { w: w.innerWidth, h: w.innerHeight } });
    w.focus();
    return true;
  }, [title]);

  /* Follow its size; notice when someone closes it. */
  useEffect(() => {
    if (!cw) return;
    const w = cw.win;
    const onResize = () => setCw((c) => (c && c.win === w ? { ...c, size: { w: w.innerWidth, h: w.innerHeight } } : c));
    w.addEventListener('resize', onResize);
    const watch = window.setInterval(() => { if (w.closed) setCw((c) => (c && c.win === w ? null : c)); }, 700);
    return () => { try { w.removeEventListener('resize', onResize); } catch { /* closed */ } window.clearInterval(watch); };
  }, [cw?.win]);

  useEffect(() => { if (cw) { try { cw.win.document.title = title; } catch { /* closed */ } } }, [title, cw?.win]);

  /* Leaving the meeting, or the app, closes it: a window left behind would go stale. */
  useEffect(() => {
    const bye = () => { try { ref.current?.win.close(); } catch { /* gone */ } };
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); bye(); };
  }, []);

  return { client: cw, open, close };
}

/** Draws its children into the client's window. */
export const ClientPortal: React.FC<{ client: ClientWin; children: React.ReactNode }> = ({ client, children }) =>
  createPortal(children, client.root);

/**
 * Keeps the client's view scrolled to the same place as the presenter's,
 * as a fraction of what can be scrolled, so a zoomed-in detail is the same
 * detail on both screens.
 */
export function useScrollMirror() {
  const [at, setAt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const frame = useRef(0);
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const mx = el.scrollWidth - el.clientWidth;
      const my = el.scrollHeight - el.clientHeight;
      setAt({ x: mx > 0 ? el.scrollLeft / mx : 0, y: my > 0 ? el.scrollTop / my : 0 });
    });
  }, []);
  return { at, onScroll };
}

/** The receiving end: a scroll box that sits where the presenter's does. */
export const MirroredScroll: React.FC<{ at: { x: number; y: number }; className?: string; children: React.ReactNode }> = ({ at, className, children }) => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    /* Again once the page has been drawn at its new size. */
    const place = () => {
      el.scrollLeft = at.x * Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollTop = at.y * Math.max(0, el.scrollHeight - el.clientHeight);
    };
    place();
    const t = window.setTimeout(place, 250);
    return () => window.clearTimeout(t);
  });
  return <div ref={box} className={className}>{children}</div>;
};

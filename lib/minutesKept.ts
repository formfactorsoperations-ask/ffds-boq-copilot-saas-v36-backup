import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/*
  WHAT SOMEONE WAS TYPING ON THE MINUTES, KEPT ON THEIR DEVICE.

  The composer saves to the database a moment after the last keystroke, and a
  reviewer's notes are only written when the minutes are returned. Closing the
  window, clicking outside it or reloading in between used to lose the lot.

  Everything typed is written here as it is typed, in the browser's own
  storage, under a key that names the person and the minutes. It is read back
  when the same person opens the same minutes again, and dropped once the work
  has reached the database (saved, returned or approved).

  A reviewer's notes and a writer's rough notes are also written beside the
  minutes in the database a moment later (useKept's `cloud`), so they follow
  the person to another device. The rest stays on the device.
*/

const PREFIX = 'ffds:minutes-kept:v1:';
/** Nothing is kept longer than this. */
export const KEEP_FOR_MS = 30 * 24 * 60 * 60 * 1000;

export interface Kept<T> { value: T; at: number }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const store = (): Store | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

/** The key for one person's work on one set of minutes. */
export const keptKey = (...parts: Array<string | number | null | undefined>) =>
  parts.map((x) => String(x ?? '').trim().toLowerCase() || '-').join(':');

export function readKept<T>(key: string | null | undefined, s: Store | null = store(), now = Date.now()): Kept<T> | null {
  if (!key || !s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const hit = JSON.parse(raw);
    if (!hit || typeof hit.at !== 'number' || !('value' in hit) || now - hit.at > KEEP_FOR_MS) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return hit as Kept<T>;
  } catch {
    return null;
  }
}

/** True when it was kept; false when the browser's storage is full or switched off. */
export function writeKept<T>(key: string | null | undefined, value: T, s: Store | null = store(), now = Date.now()): boolean {
  if (!key || !s) return false;
  try { s.setItem(PREFIX + key, JSON.stringify({ value, at: now })); return true; } catch { return false; }
}

export function dropKept(key: string | null | undefined, s: Store | null = store()) {
  if (!key || !s) return;
  try { s.removeItem(PREFIX + key); } catch { /* nothing to drop */ }
}

/** Drops everything kept under a key and the keys below it ("…:new:<topic>"). */
export function dropKeptUnder(key: string | null | undefined, s: Store | null = store()) {
  if (!key || !s) return;
  try {
    const mine: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && (k === PREFIX + key || k.startsWith(`${PREFIX}${key}:`))) mine.push(k);
    }
    mine.forEach((k) => s.removeItem(k));
  } catch { /* nothing to drop */ }
}

/** Clears what has been kept for longer than a month. */
export function sweepKept(s: Store | null = store(), now = Date.now()) {
  if (!s) return;
  try {
    const old: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      let at = 0;
      try { at = Number(JSON.parse(s.getItem(k) || '{}').at) || 0; } catch { at = 0; }
      if (now - at > KEEP_FOR_MS) old.push(k);
    }
    old.forEach((k) => s.removeItem(k));
  } catch { /* nothing to sweep */ }
}

let swept = false;

/**
 * The same work kept with the minutes in the database, so it follows the
 * person to another device (services/minutesService keptInCloud).
 */
export interface KeptCloud<T> { read: () => Promise<Kept<T> | null>; write: (k: Kept<T>) => Promise<void> }

/**
 * State that is kept on the device under `key` as it changes, and in `cloud`
 * a moment later when one is given. `clear` empties it and forgets it; a
 * value equal to `empty` is not kept on the device at all.
 *
 * Returns the value, its setter, `clear`, then:
 *   found   something from an earlier visit (here or on another device) was read back
 *   safe    false when the browser would not keep the latest value
 *   synced  the latest value has reached the database
 *
 * Whichever copy was typed last wins. Emptying it is written to the database
 * too, so notes already sent do not come back from another device.
 */
export function useKept<T>(key: string | null | undefined, empty: T, cloud?: KeptCloud<T> | null): [T, Dispatch<SetStateAction<T>>, () => void, boolean, boolean, boolean] {
  const start = useRef<Kept<T> | null | undefined>(undefined);
  if (start.current === undefined) {
    if (!swept) { swept = true; sweepKept(); }
    start.current = readKept<T>(key);
  }
  const [value, setValue] = useState<T>(() => (start.current ? start.current.value : empty));
  const [found, setFound] = useState(!!start.current);
  const [safe, setSafe] = useState(true);
  const [synced, setSynced] = useState(false);
  const blank = useRef(JSON.stringify(empty));
  const at = useRef(start.current?.at || 0);
  const first = useRef(true);
  const typed = useRef(false);
  const fromCloud = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const cloudNow = useRef(cloud);
  cloudNow.current = cloud;

  const push = () => {
    timer.current = null;
    const c = cloudNow.current;
    if (!c) return;
    c.write({ value: latest.current, at: at.current }).then(() => setSynced(true)).catch(() => setSynced(false));
  };
  const keepHere = (v: T) => {
    if (JSON.stringify(v) === blank.current) { dropKept(key); setSafe(true); } else setSafe(writeKept(key, v, undefined, at.current));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    /* Read from the database: it keeps the time it was typed. */
    if (fromCloud.current) { fromCloud.current = false; keepHere(value); return; }
    typed.current = true;
    at.current = Date.now();
    keepHere(value);
    if (cloudNow.current) {
      setSynced(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(push, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  /* What the database holds, when it is newer than what this device has. */
  const hasCloud = !!cloud;
  useEffect(() => {
    const c = cloudNow.current;
    if (!c) return;
    let live = true;
    c.read().then((hit) => {
      if (!live || typed.current) return;
      if (hit && hit.at > at.current) {
        at.current = hit.at;
        if (JSON.stringify(hit.value) !== JSON.stringify(latest.current)) {
          fromCloud.current = true;
          setFound(JSON.stringify(hit.value) !== blank.current);
          setValue(hit.value);
        }
        setSynced(true);
      } else if (at.current > (hit?.at || 0)) push();
      else if (hit) setSynced(true);
    }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasCloud]);

  /* Closed before the moment passed: send it now. */
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); push(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    dropKept(key);
    /* Told to the database at once: the screen is often gone before a later write could be made. */
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    at.current = Date.now();
    cloudNow.current?.write({ value: empty, at: at.current }).then(() => setSynced(true)).catch(() => undefined);
    fromCloud.current = JSON.stringify(latest.current) !== blank.current;
    setValue(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear, found, safe, synced];
}

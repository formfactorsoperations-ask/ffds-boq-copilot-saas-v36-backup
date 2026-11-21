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

  It never leaves the device: another person, or the same person on another
  computer, does not see it.
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
 * State that is kept on the device under `key` as it changes. `clear` empties
 * it and forgets it; a value equal to `empty` is not kept at all. `found` is
 * true when something from an earlier visit was read back; `safe` is false
 * when the browser would not keep the latest value.
 */
export function useKept<T>(key: string | null | undefined, empty: T): [T, Dispatch<SetStateAction<T>>, () => void, boolean, boolean] {
  const start = useRef<Kept<T> | null | undefined>(undefined);
  if (start.current === undefined) {
    if (!swept) { swept = true; sweepKept(); }
    start.current = readKept<T>(key);
  }
  const [value, setValue] = useState<T>(() => (start.current ? start.current.value : empty));
  const blank = useRef(JSON.stringify(empty));

  const [safe, setSafe] = useState(true);

  useEffect(() => {
    if (JSON.stringify(value) === blank.current) { dropKept(key); setSafe(true); } else setSafe(writeKept(key, value));
  }, [key, value]);

  const clear = useCallback(() => {
    dropKept(key);
    setValue(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear, !!start.current, safe];
}

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

/** A single figure in the header's vitals strip. */
export interface Vital {
  /** Short uppercase label, e.g. "BOQ total". */
  label: string;
  /** Pre-formatted value. Formatting belongs to the page, not the header. */
  value: string;
  /** Tints the value. Use sparingly — only when the number itself is the signal. */
  tone?: 'good' | 'warn';
}

export interface PageHeaderSlots {
  /** Scope or version this page is acting on, e.g. the active tier name. */
  badge?: string;
  /** Up to four figures. More than four stops being scannable. */
  vitals?: Vital[];
  /** View switcher, actions — rendered right-aligned in that order. */
  views?: React.ReactNode;
  actions?: React.ReactNode;
}

interface Ctx {
  slots: PageHeaderSlots;
  claim: (owner: number, s: PageHeaderSlots) => void;
  release: (owner: number) => void;
  reset: () => void;
}

const EMPTY_SLOTS: PageHeaderSlots = {};

const PageHeaderContext = createContext<Ctx>({ slots: {}, claim: () => {}, release: () => {}, reset: () => {} });

function isSlotsEqual(a: PageHeaderSlots, b: PageHeaderSlots): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.badge !== b.badge) return false;

  const aVitals = a.vitals;
  const bVitals = b.vitals;
  if (aVitals !== bVitals) {
    if (!aVitals || !bVitals) return false;
    if (aVitals.length !== bVitals.length) return false;
    for (let i = 0; i < aVitals.length; i++) {
      if (
        aVitals[i].label !== bVitals[i].label ||
        aVitals[i].value !== bVitals[i].value ||
        aVitals[i].tone !== bVitals[i].tone
      ) {
        return false;
      }
    }
  }

  if (a.views !== b.views) return false;
  if (a.actions !== b.actions) return false;

  return true;
}

export const PageHeaderProvider: React.FC<{ route: string; children: React.ReactNode }> = ({ route, children }) => {
  const [state, setState] = useState<{ slots: PageHeaderSlots; route: string | null }>({ slots: {}, route: null });
  const ownerRef = useRef<number | null>(null);

  // Kept current during render, so a claim is stamped with the route that was
  // active when the page made it. No effect ordering is involved.
  const routeRef = useRef(route);
  routeRef.current = route;

  // Slots only apply to the route that claimed them. This is what stops a
  // departing page's vitals leaking onto the next one.
  const slots = state.route === route ? state.slots : EMPTY_SLOTS;

  /**
   * Ownership matters because on a route change React can run the outgoing page's
   * cleanup *after* the incoming page's effect. Without this guard the departing
   * page blanks the arriving page's slots, and the header silently falls back to
   * its subtitle.
   */
  const claim = useCallback((owner: number, next: PageHeaderSlots) => {
    ownerRef.current = owner;
    setState(prev => {
      if (prev.route === routeRef.current && isSlotsEqual(prev.slots, next)) {
        return prev;
      }
      return { slots: next, route: routeRef.current };
    });
  }, []);

  const release = useCallback((owner: number) => {
    if (ownerRef.current !== owner) return; // someone else already took over
    ownerRef.current = null;
    setState({ slots: {}, route: null });
  }, []);

  /**
   * Cleared by the shell when the route changes, not by pages on unmount.
   * Unmount cleanup is unreliable here: StrictMode's mount → cleanup → mount
   * cycle interleaves with route transitions, so a page could clear slots it
   * had just claimed. The shell renders above the pages, so its effect runs
   * first and the arriving page always claims into a clean slate.
   */
  const reset = useCallback(() => {
    ownerRef.current = null;
    setState({ slots: {}, route: null });
  }, []);

  const value = useMemo(() => ({ slots, claim, release, reset }), [slots, claim, release, reset]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
};

/** Read the current slots. Used by PageTitleBlock. */
export const usePageHeaderSlots = () => useContext(PageHeaderContext).slots;

/** Clears slots. Only the shell should call this, on route change. */
export const usePageHeaderReset = () => useContext(PageHeaderContext).reset;

/**
 * Contribute badge / vitals / controls to the page header from inside a page.
 *
 * Pass a dependency array exactly as you would to useEffect — the slots are only
 * pushed when those change, so passing inline JSX for `views`/`actions` is fine.
 *
 *   usePageHeader({ badge: tier.name, vitals: [...] }, [tier.id, total]);
 */
let nextOwnerId = 1;

export const usePageHeader = (slots: PageHeaderSlots, deps?: React.DependencyList) => {
  const { claim } = useContext(PageHeaderContext);
  const ownerRef = useRef<number>(0);
  if (ownerRef.current === 0) ownerRef.current = nextOwnerId++;

  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(() => {
    claim(ownerRef.current, slotsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || [slots.badge, JSON.stringify(slots.vitals)]);
}

export default PageHeaderContext;

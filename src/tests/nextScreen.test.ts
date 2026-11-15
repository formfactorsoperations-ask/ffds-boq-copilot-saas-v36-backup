/*
  "What's next" after creating a project: the wizard opens what it made, and
  every stage screen ends in a Next button that walks the workflow in order.
*/
import { describe, it, expect } from 'vitest';
import { NAV_CONFIG, nextScreen, landingAfterSetup } from '../../components/navConfig';
import { navItemsFor, isRouteHidden } from '../../lib/engagement';

const navFor = (e: any) => NAV_CONFIG.map((s) => ({ ...s, items: navItemsFor(e, s.items) }));
const TURNKEY = navFor('turnkey');
const walk = (nav: any, from: string, opts: any = {}) => {
  const seen: string[] = [];
  let at: string | null = from;
  while (at && seen.length < 40) {
    const n = nextScreen(nav, at, opts);
    at = n ? n.route : null;
    if (at) seen.push(at);
  }
  return seen;
};

describe('Next button', () => {
  it('walks the commercial path in order, across stages', () => {
    expect(nextScreen(TURNKEY, 'leadiq')).toMatchObject({ route: 'ops', label: 'Pricing & Tiers', stage: 2 });
    expect(nextScreen(TURNKEY, 'ops')).toMatchObject({ route: 'boq-editor', label: 'BOQ Editor' });
    expect(nextScreen(TURNKEY, 'boq-editor')?.route).toBe('analytics');
    expect(nextScreen(TURNKEY, 'analytics')).toMatchObject({ route: 'client', stage: 3 });
  });

  it('ends at the last screen', () => {
    expect(nextScreen(TURNKEY, 'handover-docket')).toBeNull();
  });

  it('stops before a stage that is still locked', () => {
    const locked = (stage: number) => stage >= 4;
    expect(nextScreen(TURNKEY, 'onboarding', { isStageLocked: locked })).toBeNull();
    expect(nextScreen(TURNKEY, 'terms-docket', { isStageLocked: locked })?.route).toBe('onboarding');
  });

  it('skips a screen this person cannot open', () => {
    const noMoney = (item: any) => !!item.money;
    expect(nextScreen(TURNKEY, 'leadiq', { isHidden: noMoney })?.route).toBe('boq-editor');
    expect(walk(TURNKEY, 'leadiq', { isHidden: noMoney })).not.toContain('payment-calc');
  });

  it('follows a design-only project, which has no pricing or BOQ', () => {
    const design = navFor('design_only');
    expect(nextScreen(design, 'leadiq')?.route).toBe('client');
    expect(walk(design, 'leadiq')).not.toContain('boq-editor');
  });

  it('is not shown off the workflow (the Hub, the always-on screens)', () => {
    expect(nextScreen(TURNKEY, 'dashboard')).toBeNull();
    expect(nextScreen(TURNKEY, 'timeline')).toBeNull();
  });
});

describe('After the setup wizard', () => {
  const hidden = (e: any) => (r: string) => isRouteHidden(e, r);
  it('opens the options it generated, or the BOQ for a manual start', () => {
    expect(landingAfterSetup(hidden('turnkey'), 'options')).toBe('ops');
    expect(landingAfterSetup(hidden('turnkey'), 'manual')).toBe('boq-editor');
  });
  it('opens the proposal on a design-only project', () => {
    expect(landingAfterSetup(hidden('design_only'), 'options')).toBe('client');
    expect(landingAfterSetup(hidden('design_only'), 'manual')).toBe('client');
  });
  it('opens the BOQ on Design & PMC, which has no pricing screen', () => {
    expect(landingAfterSetup(hidden('design_pmc'), 'options')).toBe('boq-editor');
  });
});

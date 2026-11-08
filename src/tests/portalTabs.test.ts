import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  APPROVED_PORTAL_LENSES, APPROVED_DESIGN_SCOPE_TABS, approvedLenses, approvedDesignScopeTabs,
} from '../../lib/portalTabs';

/*
  NO TAB REACHES A CLIENT WITHOUT THE STUDIO OWNER'S APPROVAL.

  If one of these fails, a tab was added to or removed from the client portal.
  Do not just update the list to make it pass: the studio owner approves every
  tab a client sees (lib/portalTabs.ts). A "Design record" tab once appeared in
  a client's portal because a design meeting was held, and nobody had decided
  the client should see it.
*/

const portalSource = fs.readFileSync(path.resolve(__dirname, '../../components/ClientPortal.tsx'), 'utf8');

describe('the tabs a client portal shows', () => {
  it('are exactly the ones the studio owner approved', () => {
    expect([...APPROVED_PORTAL_LENSES]).toEqual(['overview', 'timeline', 'decisions', 'documents', 'financials', 'designScope']);
    expect([...APPROVED_DESIGN_SCOPE_TABS]).toEqual(['drawings', 'scope']);
  });

  it('never include a tab that is not approved, whatever the screen declares', () => {
    const declared = [{ id: 'overview' }, { id: 'designRecord' }, { id: 'timeline' }];
    expect(approvedLenses(declared).map((t) => t.id)).toEqual(['overview', 'timeline']);
    expect(approvedDesignScopeTabs([{ id: 'drawings' }, { id: 'record' }, { id: 'scope' }]).map((t) => t.id)).toEqual(['drawings', 'scope']);
  });

  it('are drawn through the approved list in the portal itself', () => {
    expect(portalSource).toMatch(/const PORTAL_LENSES = approvedLenses\(/);
    expect(portalSource).toMatch(/approvedDesignScopeTabs\(\[/);
  });

  it('do not include the Design record', () => {
    expect(portalSource).not.toMatch(/label: 'Design record'/);
    expect(portalSource).not.toMatch(/<PortalDesignRecord/);
  });
});

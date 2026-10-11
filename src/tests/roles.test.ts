import { describe, it, expect } from 'vitest';
import { rolesOf, primaryRole, hasRole, memberRoles, roleLabel } from '../../lib/roles';
import { seesStudioFinance, isDesignerRole, mayOpenStudioTab, designerMayOpen, isLimitedRole, teamViewKindOf, limitedMayOpen, limitedHomeTab, visibleToRole } from '../../lib/roleAccess';
import { canReview, canUpload, canSetAudience, canRunMeeting } from '../../lib/drawingReview';

describe('several roles', () => {
  it('cleans and orders roles, most senior first', () => {
    expect(rolesOf(['Design Head', 'Admin', 'Admin', ' '])).toEqual(['Admin', 'Design Head']);
    expect(rolesOf('Designer')).toEqual(['Designer']);
    expect(rolesOf(null)).toEqual([]);
    expect(primaryRole(['Designer', 'Design Head'])).toBe('Design Head');
    expect(roleLabel(['Design Head', 'Admin'])).toBe('Admin + Design Head');
  });

  it('reads a team row with or without the newer list', () => {
    expect(memberRoles({ role: 'Design Head', roles: ['Admin'] })).toEqual(['Admin', 'Design Head']);
    expect(memberRoles({ role: 'Designer' })).toEqual(['Designer']);
    expect(hasRole(['Ops Director', 'Design Head'], new Set(['Design Head']))).toBe(true);
  });

  it('lets any one role grant a permission', () => {
    // An Ops Director who is also the Design Head reviews; neither alone would do both.
    const both = ['Ops Director', 'Design Head'];
    expect(canReview('Ops Director')).toBe(false);
    expect(canReview(both)).toBe(true);
    expect(canRunMeeting(both)).toBe(true);
    expect(seesStudioFinance('Design Head')).toBe(false);
    expect(seesStudioFinance(both)).toBe(true);
    expect(canUpload('Designer') && canSetAudience(['Designer', 'Design Head'])).toBe(true);
  });

  it('limits to assigned projects only someone who is nothing but a Designer', () => {
    expect(isDesignerRole('Designer')).toBe(true);
    expect(isDesignerRole(['Designer'])).toBe(true);
    expect(isDesignerRole(['Designer', 'Design Head'])).toBe(false);
    expect(isDesignerRole(['Designer', 'Viewer'])).toBe(false);
  });
});

describe('studio screens by role', () => {
  it('keeps the setup and money screens for the studio leads', () => {
    for (const tab of ['reports', 'studio-settings', 'admin-templates-bank']) {
      expect(mayOpenStudioTab(tab, 'Admin')).toBe(true);
      expect(mayOpenStudioTab(tab, 'Owner')).toBe(true);
      expect(mayOpenStudioTab(tab, 'Design Head')).toBe(false);
      expect(mayOpenStudioTab(tab, 'Designer')).toBe(false);
      expect(mayOpenStudioTab(tab, ['Admin', 'Design Head'])).toBe(true);
    }
  });

  it('gives the platform owner (Super Admin) every studio screen, so the home dial is full', () => {
    for (const tab of ['home', 'projects', 'design-review', 'clients', 'reports', 'studio-settings', 'admin-templates-bank']) {
      expect(mayOpenStudioTab(tab, 'Super Admin')).toBe(true);
    }
  });

  it('gives a Designer the home page, their projects and Design Desk, but not Clients', () => {
    expect(mayOpenStudioTab('home', 'Designer')).toBe(true);
    expect(designerMayOpen('home')).toBe(true);
    expect(mayOpenStudioTab('projects', 'Designer')).toBe(true);
    expect(mayOpenStudioTab('design-review', 'Designer')).toBe(true);
    expect(mayOpenStudioTab('clients', 'Designer')).toBe(false);
  });

  it('gives the Design Head home, projects, clients and Design Desk', () => {
    for (const tab of ['home', 'projects', 'clients', 'design-review']) expect(mayOpenStudioTab(tab, 'Design Head')).toBe(true);
  });
});

describe('the roles limited to assigned projects', () => {
  it('are Designer, Client Relations, Site Supervisor and Vendor, unless a broader role comes with them', () => {
    for (const r of ['Designer', 'Client Relations', 'Site Supervisor', 'Vendor']) expect(isLimitedRole(r)).toBe(true);
    for (const r of ['Owner', 'Admin', 'Ops Director', 'Design Head', 'Viewer']) expect(isLimitedRole(r)).toBe(false);
    expect(isLimitedRole(['Client Relations', 'Admin'])).toBe(false);
    expect(isLimitedRole(['Site Supervisor', 'Viewer'])).toBe(false);
    expect(primaryRole(['Designer', 'Client Relations'])).toBe('Client Relations');
  });

  it('each reads its own copy', () => {
    expect(teamViewKindOf('Designer')).toBe('design');
    expect(teamViewKindOf('Client Relations')).toBe('ops');
    expect(teamViewKindOf('Site Supervisor')).toBe('site');
    expect(teamViewKindOf('Vendor')).toBeNull();
    expect(teamViewKindOf('Admin')).toBeNull();
  });

  it('gives Client Relations the client screens and nothing about money or setup', () => {
    for (const t of ['comms-tracker', 'timeline', 'record-decision', 'drawing-tracker', 'home', 'projects']) {
      expect(limitedMayOpen('Client Relations', t), t).toBe(true);
    }
    for (const t of ['payment-calc', 'ops', 'boq-editor', 'execution-agreement', 'site-ops', 'clients', 'reports', 'studio-settings']) {
      expect(limitedMayOpen('Client Relations', t), t).toBe(false);
    }
    expect(limitedHomeTab('Client Relations')).toBe('comms-tracker');
    expect(limitedHomeTab('Designer')).toBe('drawing-tracker');
    expect(limitedMayOpen('Admin', 'payment-calc')).toBe(true);
    expect(mayOpenStudioTab('home', 'Client Relations')).toBe(true);
    expect(mayOpenStudioTab('clients', 'Client Relations')).toBe(false);
  });

  it('lists for Client Relations only the projects assigned to them', () => {
    const projects = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3', _teamView: 'ops' } as any];
    const map = { p1: ['cr@a.com'], p2: ['d@a.com'] };
    expect(visibleToRole(projects, 'Client Relations', 'CR@a.com', map).map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(visibleToRole(projects, 'Client Relations', '', map)).toEqual([]);
    expect(visibleToRole(projects, 'Admin', 'm@a.com', map)).toHaveLength(3);
  });
});

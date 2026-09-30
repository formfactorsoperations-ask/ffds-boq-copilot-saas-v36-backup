import { useSyncExternalStore, useCallback } from 'react';
import { useOrg } from '../contexts/OrgContext';
import { assignedDesignersFor, ProjectDesignersMap, seesStudioFinance } from '../lib/roleAccess';

/**
 * Who works on which project, read and changed from three places: the team
 * avatars in a project's header, a Designer's row in Studio settings → Team,
 * and the Projects list. All three go through here, so they cannot disagree.
 *
 * Assignments are kept on the studio record as `projectDesigners`, a map of
 * project id to Designer emails (see lib/roleAccess assignedDesignersFor).
 */

/* ── A small directory of the studio's projects ─────────────────────────────
   The Team screen lives several components away from the project library, so
   App publishes a light copy here instead of threading it through props. */
export interface DirectoryProject {
  id: string;
  name: string;
  client?: string;
  status?: string;
  context?: any;
}

let directory: DirectoryProject[] = [];
const listeners = new Set<() => void>();

export function publishProjectDirectory(list: DirectoryProject[]) {
  directory = list;
  listeners.forEach((l) => l());
}

export function useProjectDirectory(): DirectoryProject[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => directory,
    () => directory,
  );
}

export interface TeamPerson {
  email: string;
  name: string;
  role: string;
}

export function useProjectTeam() {
  const { orgData, updateOrgData, teamMembers, currentRole } = useOrg();
  const map: ProjectDesignersMap = ((orgData as any)?.projectDesigners as ProjectDesignersMap) || {};
  const team: any[] = ((orgData as any)?.team as any[]) || (teamMembers as any[]) || [];

  const designers: TeamPerson[] = team
    .filter((m) => m?.role === 'Designer' && String(m?.email || '').trim())
    .map((m) => ({ email: String(m.email).trim().toLowerCase(), name: m.name || m.email, role: 'Designer' }));

  /** Only the studio's senior roles hand out projects. */
  const canAssign = seesStudioFinance(currentRole);

  const designersOn = useCallback(
    (project: { id?: string; context?: any } | null | undefined) => assignedDesignersFor(project, map),
    [map],
  );

  const write = (next: ProjectDesignersMap) => updateOrgData({ projectDesigners: next } as any);

  /** Put one person on, or take them off, one project. */
  const toggle = async (project: { id: string; context?: any }, email: string) => {
    if (!canAssign) return;
    const e = email.trim().toLowerCase();
    const current = assignedDesignersFor(project, map);
    const nextList = current.includes(e) ? current.filter((x) => x !== e) : [...current, e];
    await write({ ...map, [project.id]: nextList });
  };

  /**
   * Set exactly which of the given projects one Designer is on: on for those
   * in `onIds`, off for the rest of `scope`. One write for all of them.
   */
  const setDesignerProjects = async (email: string, scope: { id: string; context?: any }[], onIds: string[]) => {
    if (!canAssign) return;
    const e = email.trim().toLowerCase();
    const on = new Set(onIds);
    const next: ProjectDesignersMap = { ...map };
    for (const p of scope) {
      const current = assignedDesignersFor(p, map);
      const has = current.includes(e);
      if (on.has(p.id) && !has) next[p.id] = [...current, e];
      else if (!on.has(p.id) && has) next[p.id] = current.filter((x) => x !== e);
    }
    await write(next);
  };

  return { map, designers, canAssign, designersOn, toggle, setDesignerProjects };
}

/** Two-letter initials for an avatar. */
export const initialsOf = (name: string): string => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** A stable colour per person, so the same face reads the same everywhere. */
const PALETTE = ['#2E7D6B', '#7C5CC4', '#B45309', '#3D52A0', '#BE185D', '#0E7490', '#4D7C0F'];
export const colourOf = (email: string): string => {
  let h = 0;
  for (const ch of String(email || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/**
 * IS THIS REAL WORK?
 *
 * The studio tags a project Actual or Dummy on its context card, which writes
 * `isDummy` and `projectCategory`. Reports used to fall back to guessing from
 * the project's NAME when neither was set, and the guess was wrong in both
 * directions: it passed "Lake Pleasant Powai (Template)" and nine empty "New
 * Project" shells through as real work, while a genuine project that happened
 * to have "test" in its name would have been thrown out.
 *
 * So there is no guess here. A project is what its tag says, and when it has no
 * tag it is UNTAGGED -- a third state, not a coin flip. Untagged is surfaced and
 * counted openly rather than silently folded into one side or the other.
 *
 * The one inference kept is `isEmptyShell`, and it is never used to classify.
 * It only separates "nobody has filled this in" from "this needs your judgement"
 * so the screen can say which untagged projects are worth a moment and which are
 * abandoned drafts to delete.
 */

export type ProjectClass = "actual" | "test" | "untagged";

/** What the project's own tag says. Nothing is inferred from the name. */
export function classifyProject(p: any): ProjectClass {
  const c = p?.context || {};
  /* isDummy is the newer, explicit flag and wins where both exist. */
  if (typeof c.isDummy === "boolean") return c.isDummy ? "test" : "actual";
  if (c.projectCategory === "dummy") return "test";
  if (c.projectCategory === "actual") return "actual";
  return "untagged";
}

/**
 * A project nobody ever filled in: no client, no value, no tiers, no payment
 * milestones. Used only to tell an abandoned draft apart from an untagged real
 * project, never to decide whether something is test data.
 */
export function isEmptyShell(p: any, valueOf: (p: any) => number): boolean {
  const c = p?.context || {};
  return (
    !c.clientName &&
    !(valueOf(p) || 0) &&
    !(p?.tiers || []).length &&
    !(c.paymentMilestones || []).length
  );
}

/**
 * What each scope counts. `actual` is strict: the tag, and only the tag.
 *
 * `test` is the mirror of it, and exists for a reason that is not curiosity:
 * on this studio the only purchase orders ever raised sit on a test project, so
 * the Margin panel reads permanently blind on real work. Test-only is the one
 * place the procurement-to-margin chain can be watched actually computing.
 * It is a workshop, not a report, and the screen says so while it is selected.
 */
export type ReportScope = "actual" | "untagged" | "all" | "test";

export const SCOPE_LABEL: Record<ReportScope, string> = {
  actual: "Tagged actual",
  untagged: "Actual + untagged",
  all: "Everything",
  test: "Test only",
};

export function inScope(p: any, scope: ReportScope): boolean {
  const k = classifyProject(p);
  if (scope === "all") return true;
  if (scope === "actual") return k === "actual";
  if (scope === "test") return k === "test";
  return k !== "test";
}

export interface ClassCounts {
  actual: number;
  test: number;
  untagged: number;
  /** Of the untagged, the ones that were never filled in at all. */
  untaggedEmpty: number;
  total: number;
}

export function countClasses(projects: any[], valueOf: (p: any) => number): ClassCounts {
  const out: ClassCounts = { actual: 0, test: 0, untagged: 0, untaggedEmpty: 0, total: 0 };
  for (const p of projects || []) {
    out.total++;
    const k = classifyProject(p);
    out[k]++;
    if (k === "untagged" && isEmptyShell(p, valueOf)) out.untaggedEmpty++;
  }
  return out;
}

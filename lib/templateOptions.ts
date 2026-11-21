/**
 * Which options take each Standard template item.
 *
 * A template lists a room scope's items once: the fully loaded room. Each item
 * can be marked for the options that take it — Essential, Comfort, Premium (the
 * studio's three option grades). Unmarked means all three, so every template
 * saved before this reads exactly as it did. Taken by all three it is a
 * must-have; by fewer, an extra; by none, it is kept on the list and left out.
 *
 * The marks are saved inside the typology, beside its room scopes, under one
 * reserved key, so they travel with it when it is copied, exported or saved:
 *
 *   '3-BHK': { bedroom: ['gen-014', 'gen-016'], __options: ['bedroom|gen-016|CP'] }
 *
 * Everything that walks a typology's room scopes reads them through
 * `roomScopesOf`, which leaves the reserved key out.
 *
 * Pure.
 */
import { GRADES, type Grade } from './materialSpecs';

/** One typology of the Standard templates: room scope → item ids. */
export type TemplateScopes = Record<string, string[]>;

export const OPTIONS_KEY = '__options';

/** The typology's room scopes, without the option marks. */
export function roomScopesOf(template: TemplateScopes | null | undefined): TemplateScopes {
  if (!template || !(OPTIONS_KEY in template)) return template || {};
  const { [OPTIONS_KEY]: _marks, ...scopes } = template;
  return scopes;
}

const keyOf = (scope: string, itemId: string) => `${scope}|${itemId}`;

/** scope|item → the grades that take it. Only items marked for fewer than all three are here. */
export function optionMarks(template: TemplateScopes | null | undefined): Map<string, Grade[]> {
  const out = new Map<string, Grade[]>();
  (template?.[OPTIONS_KEY] || []).forEach(entry => {
    const cut = String(entry).lastIndexOf('|');
    if (cut <= 0) return;
    const letters = String(entry).slice(cut + 1);
    out.set(String(entry).slice(0, cut), GRADES.filter(g => letters.includes(g)));
  });
  return out;
}

/** The options that take an item in a room scope: all three unless marked. */
export function gradesFor(template: TemplateScopes | null | undefined, scope: string, itemId: string): Grade[] {
  return optionMarks(template).get(keyOf(scope, itemId)) || [...GRADES];
}

/** True when the option at this grade takes the item. */
export const takes = (marks: Map<string, Grade[]>, scope: string, itemId: string, grade: Grade) =>
  (marks.get(keyOf(scope, itemId)) || GRADES).includes(grade);

/** The typology with an item marked for these options. All three clears the mark. */
export function withGrades(template: TemplateScopes, scope: string, itemId: string, grades: Grade[]): TemplateScopes {
  const marks = optionMarks(template);
  const next = GRADES.filter(g => grades.includes(g));
  if (next.length === GRADES.length) marks.delete(keyOf(scope, itemId));
  else marks.set(keyOf(scope, itemId), next);
  return withMarks(template, marks);
}

/** The typology with the marks of items no longer in their room scope dropped. */
export function prunedMarks(template: TemplateScopes): TemplateScopes {
  const marks = optionMarks(template);
  if (!marks.size) return template;
  const scopes = roomScopesOf(template);
  let changed = false;
  [...marks.keys()].forEach(k => {
    const cut = k.indexOf('|');
    if (!(scopes[k.slice(0, cut)] || []).includes(k.slice(cut + 1))) { marks.delete(k); changed = true; }
  });
  return changed ? withMarks(template, marks) : template;
}

function withMarks(template: TemplateScopes, marks: Map<string, Grade[]>): TemplateScopes {
  const scopes = roomScopesOf(template);
  if (!marks.size) return { ...scopes };
  return { ...scopes, [OPTIONS_KEY]: [...marks.entries()].map(([k, g]) => `${k}|${g.join('')}`).sort() };
}

/** How an item reads on its row. */
export function roleOf(grades: Grade[]): 'must' | 'extra' | 'none' {
  return grades.length === GRADES.length ? 'must' : grades.length ? 'extra' : 'none';
}

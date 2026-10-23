/**
 * SPECIFICATIONS — the text that tells a client what a BOQ line buys.
 *
 * The studio writes them in the client sheet's Specifications column, one cell
 * per line, in a fixed shape:
 *
 *   35 mm laminated safety door · MS grill · BWP frame cladding      <- summary
 *
 *   SCOPE: New safety door at the main entrance, in laminate finish
 *   MATERIAL:
 *   • Door frame cladding: BWP plywood
 *   HARDWARE:
 *   • Lock set: Enox/Godrej · allowance ₹3,000
 *   EXCLUDES:
 *   • Video door phone, digital / smart lock
 *   NOTE: A selection above any allowance is charged at the difference
 *
 * The text is stored as written (cleaned, line breaks kept), so the Excel cell
 * reads exactly like the sheet it came from. `parseSpec` reads the shape back
 * for screens that show the summary first and the sections on request. Text in
 * no particular shape still reads: its first line is the summary and the rest
 * is one unlabelled section.
 */

export interface SpecSection {
  /** "SCOPE", "MATERIAL" … as written; empty for text under no label. */
  label: string;
  items: string[];
}

export interface ParsedSpec {
  summary: string;
  sections: SpecSection[];
}

/* A section label: capitals at the start of a line, then a colon. A bulleted
   line ("• Door frame cladding: BWP plywood") and a sentence ("Frame: 18 mm")
   are content, not labels. */
const LABEL = /^([A-Z][A-Z &/()-]{1,30}):\s*(.*)$/;
const BULLET = /^[•▪●◦*-]\s*/;

/**
 * Tidy a specification cell without changing what it says: one line break per
 * line, single spaces, no trailing separators, no line repeated twice in a row
 * (a bullet pasted twice into one line, padded out with spaces, is a common
 * spreadsheet slip).
 */
export function cleanSpec(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const lines = String(raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    // Two bullets on one line, kept apart by a run of spaces: two lines.
    .flatMap(l => l.split(/\s{2,}(?=[•▪●])/))
    .map(l => l.replace(/[\s ]+/g, ' ').trim().replace(/\s*·$/, '').trim());

  const out: string[] = [];
  for (const l of lines) {
    if (!l) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (out.length && out[out.length - 1] === l) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  if (out.length) out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1);
  return out.join('\n');
}

/** Read a specification back into its summary and labelled sections. */
export function parseSpec(text: unknown): ParsedSpec {
  const lines = cleanSpec(text).split('\n').filter(Boolean);
  if (!lines.length) return { summary: '', sections: [] };

  let summary = '';
  const sections: SpecSection[] = [];
  let current: SpecSection | null = null;

  lines.forEach((line, i) => {
    const m = line.match(LABEL);
    if (m) {
      current = { label: m[1].trim(), items: [] };
      sections.push(current);
      const rest = m[2].replace(BULLET, '').trim();
      if (rest) current.items.push(rest);
      return;
    }
    if (i === 0) {
      summary = line;
      return;
    }
    if (!current) {
      current = { label: '', items: [] };
      sections.push(current);
    }
    current.items.push(line.replace(BULLET, '').trim());
  });

  return { summary, sections: sections.filter(s => s.items.length) };
}

/** "MATERIAL" -> "Material", for screens that set labels in sentence case. */
export const specLabel = (label: string): string =>
  label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : '';

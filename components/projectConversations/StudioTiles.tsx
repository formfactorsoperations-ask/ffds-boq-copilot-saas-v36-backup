import React from 'react';

/*
  THE STUDIO'S SECTIONS AS GLASS BUBBLES (owner, 27 Nov 2026: chose "D1" from
  the icon options page, colour line icons with glass morphism). Each
  section is a colour line icon, two tones of its own colour, sitting in a
  round frosted-glass bubble over a faint wash of the sections' colours
  (conversations.css .cvw-tile, .cvw-wash). On hover the bubble lifts and
  the icon fills with its colour.

  The icons are drawn for this bar. Colours stay within the app's own
  families (brand blue, amber, rose, emerald, slate); the owner approved
  them for the Conversations top bar only, and every other icon tile in the
  app stays brand (DESIGN.md "Colour").

  Roles: p the main shape (a light fill and a coloured outline, filled solid
  on hover), p2 a second shape (outline only), d a detail (coloured, white on
  hover), ds a detail line (coloured, white on hover), pc a white dot.
*/

type Role = 'p' | 'p2' | 'd' | 'ds' | 'pc';
type Part = [Role, 'path' | 'rect' | 'circle' | 'ellipse', Record<string, string | number>];

const GLYPHS: Record<string, Part[]> = {
  home: [
    ['p', 'path', { d: 'M11.3 3.3a1 1 0 0 1 1.4 0l8 7.2a1 1 0 0 1-.7 1.7H19v7.3a1.5 1.5 0 0 1-1.5 1.5H14v-5h-4v5H6.5A1.5 1.5 0 0 1 5 19.5v-7.3H4a1 1 0 0 1-.7-1.7z' }],
    ['d', 'rect', { x: 10, y: 15, width: 4, height: 6, rx: 0.6, opacity: 0.45 }],
  ],
  projects: [
    ['p2', 'path', { d: 'M15 9h3.5a1.5 1.5 0 0 1 1.5 1.5V21h-5z' }],
    ['p', 'path', { d: 'M5 21V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V21z' }],
    ['d', 'rect', { x: 7.4, y: 7, width: 2, height: 2, rx: 0.4 }], ['d', 'rect', { x: 10.6, y: 7, width: 2, height: 2, rx: 0.4 }],
    ['d', 'rect', { x: 7.4, y: 11, width: 2, height: 2, rx: 0.4 }], ['d', 'rect', { x: 10.6, y: 11, width: 2, height: 2, rx: 0.4 }],
    ['d', 'rect', { x: 9, y: 16, width: 2, height: 5, rx: 0.4 }],
  ],
  'design-review': [
    ['p2', 'path', { d: 'M14.6 3.4l6 6-2.3 2.3-6-6z' }],
    ['p', 'path', { d: 'M11.5 6.5l6 6-2.9 5.9L4 21l2.6-10.6z' }],
    ['d', 'circle', { cx: 11, cy: 13, r: 1.7 }],
    ['ds', 'path', { d: 'M5 20l4.8-4.8', strokeWidth: 1.6, strokeLinecap: 'round' }],
  ],
  'ops-desk': [
    ['p2', 'rect', { x: 8, y: 2.5, width: 8, height: 7.5, rx: 1 }],
    ['p', 'path', { d: 'M5.2 6.6A2 2 0 0 1 7 5.5h10a2 2 0 0 1 1.8 1.1L21 11v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z' }],
    ['ds', 'path', { d: 'M3.5 11.5H8l1.5 2.5h5l1.5-2.5h4.5', strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' }],
  ],
  people: [
    ['p2', 'circle', { cx: 16.5, cy: 8.6, r: 2.6 }],
    ['p2', 'path', { d: 'M16 13.5c2.9.2 5 2.3 5 5.1a1 1 0 0 1-1 1h-3.2c.1-2.4-.6-4.5-1.9-6.1z' }],
    ['p', 'circle', { cx: 9, cy: 8, r: 3.3 }],
    ['p', 'path', { d: 'M3 19c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' }],
  ],
  clients: [
    ['p', 'rect', { x: 3, y: 5, width: 18, height: 14, rx: 2.5 }],
    ['d', 'circle', { cx: 9, cy: 10.4, r: 2.2 }],
    ['d', 'path', { d: 'M5.6 16.2c.4-1.9 1.8-3.1 3.4-3.1s3 1.2 3.4 3.1z' }],
    ['d', 'rect', { x: 14, y: 9, width: 4.5, height: 1.6, rx: 0.8, opacity: 0.55 }],
    ['d', 'rect', { x: 14, y: 12.6, width: 3.2, height: 1.6, rx: 0.8, opacity: 0.55 }],
  ],
  'admin-templates-bank': [
    ['p', 'rect', { x: 3.5, y: 4, width: 4.5, height: 16, rx: 1 }],
    ['p2', 'rect', { x: 9, y: 6.5, width: 4.2, height: 13.5, rx: 1 }],
    ['p', 'path', { d: 'M14.3 7.6l3.7-1 3.5 13.1-3.7 1z' }],
    ['d', 'rect', { x: 3.5, y: 7, width: 4.5, height: 1.4, opacity: 0.45 }],
    ['d', 'rect', { x: 3.5, y: 16.6, width: 4.5, height: 1.4, opacity: 0.45 }],
  ],
  portal: [
    ['p', 'circle', { cx: 12, cy: 12, r: 9 }],
    ['ds', 'ellipse', { cx: 12, cy: 12, rx: 3.8, ry: 9, strokeWidth: 1.4, opacity: 0.8 }],
    ['ds', 'path', { d: 'M3 12h18M4.6 7.6h14.8M4.6 16.4h14.8', strokeWidth: 1.4, opacity: 0.8 }],
  ],
  tour: [
    ['p', 'circle', { cx: 12, cy: 12, r: 9 }],
    ['d', 'path', { d: 'M16 8l-2.3 5.7L8 16l2.3-5.7z' }],
    ['pc', 'circle', { cx: 12, cy: 12, r: 1.2 }],
  ],
};

/** Each section's colour: the light end and the deep end. */
export const TILE_COLOURS: Record<string, { from: string; to: string }> = {
  home: { from: '#FBBF24', to: '#D97706' }, // amber
  projects: { from: '#4C65B5', to: '#334486' }, // brand
  'design-review': { from: '#FB7185', to: '#E11D48' }, // rose
  'ops-desk': { from: '#34D399', to: '#059669' }, // emerald
  people: { from: '#7091E6', to: '#3D52A0' }, // brand, lighter
  clients: { from: '#FBBF24', to: '#E11D48' }, // amber into rose
  'admin-templates-bank': { from: '#94A3B8', to: '#475569' }, // slate
  portal: { from: '#34D399', to: '#3D52A0' }, // emerald into brand
  tour: { from: '#FB7185', to: '#D97706' }, // rose into amber
};
export const DEFAULT_TILE = { from: '#7091E6', to: '#3D52A0' };

/** A colour mixed toward white (0 = the colour, 1 = white), for the bubble's inner glow. */
export function toWhite(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t).toString(16).padStart(2, '0')).join('');
}

export const hasGlyph = (key: string) => key in GLYPHS;

/** A section's line icon, drawn in two tones of its colour. */
export function StudioGlyph({ name, size = 20 }: { name: string; size?: number }) {
  const parts = GLYPHS[name];
  if (!parts) return null;
  const tone = TILE_COLOURS[name] || DEFAULT_TILE;
  const paint: Record<Role, Record<string, string | number>> = {
    p: { className: 'cvw-gp', fill: tone.from, fillOpacity: 0.22, stroke: tone.to, strokeWidth: 1.6, strokeLinejoin: 'round' },
    p2: { fill: 'none', stroke: tone.to, strokeWidth: 1.4, strokeOpacity: 0.6, strokeLinejoin: 'round' },
    d: { className: 'cvw-gd', fill: tone.to },
    ds: { className: 'cvw-gs', fill: 'none', stroke: tone.to },
    pc: { fill: '#fff' },
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {parts.map(([role, tag, attrs], i) => React.createElement(tag, { key: i, ...attrs, ...paint[role] }))}
    </svg>
  );
}

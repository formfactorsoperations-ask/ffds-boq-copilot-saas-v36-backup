import React from 'react';

/*
  THE STUDIO'S SECTIONS AS COLOUR TILES (owner, 27 Nov 2026: "i asked you to
  get me brand new icons color filled or color icons"). Drawn for this bar,
  not taken from the outline set: each section is an app-style tile, a
  gradient in one of the app's own colour families (brand blue, amber, rose,
  emerald, slate, or two of them), carrying a solid white glyph whose inner
  details take the tile's deeper colour (currentColor).

  The owner approved these colours for the Conversations top bar only; the
  rest of the app keeps its icon tiles in brand (DESIGN.md "Colour").
*/

type Glyph = React.FC;

const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">{children}</svg>
);

export const GLYPHS: Record<string, Glyph> = {
  home: () => svg(<>
    <path d="M11.3 3.3a1 1 0 0 1 1.4 0l8 7.2a1 1 0 0 1-.7 1.7H19v7.3a1.5 1.5 0 0 1-1.5 1.5H14v-5h-4v5H6.5A1.5 1.5 0 0 1 5 19.5v-7.3H4a1 1 0 0 1-.7-1.7z" fill="#fff" />
    <rect x="10" y="15" width="4" height="6" rx=".6" fill="currentColor" opacity=".45" />
  </>),
  projects: () => svg(<>
    <path d="M15 9h3.5a1.5 1.5 0 0 1 1.5 1.5V21h-5z" fill="#fff" opacity=".6" />
    <path d="M5 21V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V21z" fill="#fff" />
    <g fill="currentColor">
      <rect x="7.4" y="7" width="2" height="2" rx=".4" /><rect x="10.6" y="7" width="2" height="2" rx=".4" />
      <rect x="7.4" y="11" width="2" height="2" rx=".4" /><rect x="10.6" y="11" width="2" height="2" rx=".4" />
      <rect x="9" y="16" width="2" height="5" rx=".4" />
    </g>
  </>),
  'design-review': () => svg(<>
    <path d="M14.6 3.4l6 6-2.3 2.3-6-6z" fill="#fff" opacity=".6" />
    <path d="M11.5 6.5l6 6-2.9 5.9L4 21l2.6-10.6z" fill="#fff" />
    <circle cx="11" cy="13" r="1.7" fill="currentColor" />
    <path d="M5 20l4.8-4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </>),
  'ops-desk': () => svg(<>
    <rect x="8" y="2.5" width="8" height="7.5" rx="1" fill="#fff" opacity=".6" />
    <path d="M5.2 6.6A2 2 0 0 1 7 5.5h10a2 2 0 0 1 1.8 1.1L21 11v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z" fill="#fff" />
    <path d="M3.5 11.5H8l1.5 2.5h5l1.5-2.5h4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
  </>),
  people: () => svg(<>
    <circle cx="16.5" cy="8.6" r="2.6" fill="#fff" opacity=".6" />
    <path d="M16 13.5c2.9.2 5 2.3 5 5.1a1 1 0 0 1-1 1h-3.2c.1-2.4-.6-4.5-1.9-6.1z" fill="#fff" opacity=".6" />
    <circle cx="9" cy="8" r="3.3" fill="#fff" />
    <path d="M3 19c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#fff" />
  </>),
  clients: () => svg(<>
    <rect x="3" y="5" width="18" height="14" rx="2.5" fill="#fff" />
    <circle cx="9" cy="10.4" r="2.2" fill="currentColor" />
    <path d="M5.6 16.2c.4-1.9 1.8-3.1 3.4-3.1s3 1.2 3.4 3.1z" fill="currentColor" />
    <rect x="14" y="9" width="4.5" height="1.6" rx=".8" fill="currentColor" opacity=".55" />
    <rect x="14" y="12.6" width="3.2" height="1.6" rx=".8" fill="currentColor" opacity=".55" />
  </>),
  'admin-templates-bank': () => svg(<>
    <rect x="3.5" y="4" width="4.5" height="16" rx="1" fill="#fff" />
    <rect x="9" y="6.5" width="4.2" height="13.5" rx="1" fill="#fff" opacity=".7" />
    <path d="M14.3 7.6l3.7-1 3.5 13.1-3.7 1z" fill="#fff" />
    <rect x="3.5" y="7" width="4.5" height="1.4" fill="currentColor" opacity=".45" />
    <rect x="3.5" y="16.6" width="4.5" height="1.4" fill="currentColor" opacity=".45" />
  </>),
  portal: () => svg(<>
    <circle cx="12" cy="12" r="9" fill="#fff" />
    <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".75">
      <ellipse cx="12" cy="12" rx="3.8" ry="9" /><path d="M3 12h18M4.6 7.6h14.8M4.6 16.4h14.8" />
    </g>
  </>),
  tour: () => svg(<>
    <circle cx="12" cy="12" r="9" fill="#fff" />
    <path d="M16 8l-2.3 5.7L8 16l2.3-5.7z" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="#fff" />
  </>),
};

/** Each section's gradient (top-left to bottom-right) and the deeper colour its glyph's details take. */
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

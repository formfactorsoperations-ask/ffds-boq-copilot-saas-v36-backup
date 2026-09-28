import React from 'react';
import { ProjectStatus } from '../types';

/**
 * A small full-colour illustration for each project status, on a soft circle
 * in the status's own tint: a yellow bolt for a new lead, a golden trophy when
 * won, a hard hat on site, an orange cone when work pauses, a finished house
 * with a tick at completion.
 *
 * Chosen from the status-chip mockups (option 26). Drawn inline so it needs no
 * asset, stays sharp at any size and prints as it looks.
 */

const ART: Record<ProjectStatus, React.ReactNode> = {
  lead: (
    <>
      <circle cx="12" cy="12" r="11" fill="#e8f0ff" />
      <path d="M13.5 3 6 13.5h5.5L10 21l8-11h-5.5z" fill="#facc15" stroke="#b45309" strokeWidth="1" />
    </>
  ),
  draft: (
    <>
      <circle cx="12" cy="12" r="11" fill="#eef1f6" />
      <rect x="6" y="4.5" width="10" height="14" rx="1.5" fill="#fff" stroke="#94a3b8" />
      <path d="M8 9h6 M8 12h6 M8 15h4" stroke="#94a3b8" strokeWidth="1.2" />
      <path d="M17.5 8l2 2-6 6-2.6.6.6-2.6z" fill="#fb923c" stroke="#c2410c" strokeWidth="0.8" />
    </>
  ),
  proposal_sent: (
    <>
      <circle cx="12" cy="12" r="11" fill="#e8ecfb" />
      <path d="M20 4 4 11l6 2 2 6z" fill="#fff" stroke="#3D52A0" strokeWidth="1.1" />
      <path d="M20 4 10 13" stroke="#3D52A0" strokeWidth="1.1" />
    </>
  ),
  negotiation: (
    <>
      <circle cx="12" cy="12" r="11" fill="#fff3dc" />
      <path d="M4 7h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3 3v-3H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="#fbbf24" stroke="#b45309" strokeWidth="0.9" />
      <path d="M11 4h8a2 2 0 0 1 2 2v4" stroke="#d97706" strokeWidth="1.1" fill="none" />
    </>
  ),
  won: (
    <>
      <circle cx="12" cy="12" r="11" fill="#dcfce7" />
      <path d="M7.5 5h9v4.5a4.5 4.5 0 0 1-9 0z" fill="#fbbf24" stroke="#b45309" strokeWidth="0.9" />
      <path d="M7.5 6.5H5a2.5 2.5 0 0 0 2.7 3.3 M16.5 6.5H19a2.5 2.5 0 0 1-2.7 3.3" stroke="#b45309" strokeWidth="0.9" fill="none" />
      <path d="M12 14v3 M9 19h6" stroke="#b45309" strokeWidth="1.4" />
      <path d="M9.5 6.5l1 2" stroke="#fff" strokeWidth="1" opacity="0.8" />
    </>
  ),
  execution: (
    <>
      <circle cx="12" cy="12" r="11" fill="#f1e8ff" />
      <path d="M5 15.5a7 7 0 0 1 14 0z" fill="#facc15" stroke="#a16207" strokeWidth="0.9" />
      <path d="M3.5 15.5h17v2.2h-17z" fill="#eab308" stroke="#a16207" strokeWidth="0.9" />
      <path d="M12 8.5v7" stroke="#a16207" strokeWidth="0.9" />
    </>
  ),
  work_paused: (
    <>
      <circle cx="12" cy="12" r="11" fill="#ffe4e6" />
      <path d="M10 4.5h4l4 14H6z" fill="#fb923c" stroke="#c2410c" strokeWidth="0.9" />
      <path d="M8 11h8 M7 15h10" stroke="#fff" strokeWidth="1.6" />
      <path d="M4 18.5h16" stroke="#c2410c" strokeWidth="1.3" />
    </>
  ),
  completed: (
    <>
      <circle cx="12" cy="12" r="11" fill="#ccfbf1" />
      <path d="M4 11 12 4.5l8 6.5" stroke="#0f766e" strokeWidth="1.3" fill="none" />
      <path d="M6 10v9h12v-9" fill="#fff" stroke="#0f766e" strokeWidth="1.1" />
      <path d="M10.5 19v-4h3v4" fill="#99f6e4" stroke="#0f766e" strokeWidth="0.9" />
      <circle cx="17.5" cy="16.5" r="3.2" fill="#10b981" />
      <path d="M16 16.6l1.1 1.1 2-2.2" stroke="#fff" strokeWidth="1.1" fill="none" />
    </>
  ),
  lost: (
    <>
      <circle cx="12" cy="12" r="11" fill="#fee2e2" />
      <path d="M6 6h12v12H6z" fill="#fff" stroke="#b91c1c" strokeWidth="0.9" />
      <path d="M12 6l-1.5 4.5 3 2.2-2.2 5.3" stroke="#b91c1c" strokeWidth="1.1" fill="none" />
    </>
  ),
};

interface Props {
  status: ProjectStatus | string | null | undefined;
  /** Rendered size in pixels. */
  size?: number;
  className?: string;
}

export default function ProjectStatusIllustration({ status, size = 22, className = '' }: Props) {
  const art = ART[(status as ProjectStatus)] || ART.draft;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {art}
    </svg>
  );
}

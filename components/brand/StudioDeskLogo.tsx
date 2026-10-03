import React from 'react';
import { BRAND } from '../../lib/brand';

/**
 * THE STUDIODESK MARK.
 *
 * "Plan to block" -- "Bring plans to life", drawn: a dashed footprint on the
 * ground (the plan) and a solid block lifted above it (the built thing). The
 * block's three faces are one white at three strengths, so it reads as a
 * volume without a second colour.
 *
 * Below ~24px the dashes break up into noise, so `small` swaps them for a
 * solid, heavier footprint. public/favicon.svg is the small variant; the PWA
 * icons are the full one. Change the geometry here, change it there too.
 */
export const StudioDeskMark: React.FC<{ className?: string; title?: string; small?: boolean }> = ({ className, title, small = false }) => (
  <svg
    viewBox="0 0 48 48"
    className={className}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
  >
    <rect width="48" height="48" rx="11" fill={BRAND.color} />
    <path d="M24 5l10 5.5-10 5.5-10-5.5z" fill="#fff" />
    <path d="M14 10.5l10 5.5v11l-10-5.5z" fill="#fff" fillOpacity="0.72" />
    <path d="M34 10.5l-10 5.5v11l10-5.5z" fill="#fff" fillOpacity="0.45" />
    <path
      d="M24 29l14 7-14 7-14-7z"
      fill="none"
      stroke="#fff"
      strokeOpacity={small ? 0.7 : 0.6}
      strokeWidth={small ? 3 : 2}
      strokeLinejoin="round"
      strokeDasharray={small ? undefined : '3 2.6'}
    />
  </svg>
);

/**
 * Tervaro's own mark -- the company, not the product. It goes wherever the
 * app credits who made it, never in place of the StudioDesk mark.
 */
export const TervaroMark: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <img src={BRAND.companyMark} alt="" aria-hidden="true" className={`${className} object-contain shrink-0`} />
);

/**
 * Mark + wordmark. "The" is set lighter so the name scans as StudioDesk while
 * still being spelled as one word, the way it is written everywhere else.
 *
 * `tone="dark"` is for dark grounds (the login panel); the default is for the
 * app's light surfaces.
 */
export const StudioDeskLogo: React.FC<{
  className?: string;
  tone?: 'light' | 'dark';
  byline?: boolean;
  size?: 'sm' | 'md';
}> = ({ className = '', tone = 'light', byline = false, size = 'md' }) => {
  const onDark = tone === 'dark';
  const mark = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const word = size === 'sm' ? 'text-[15px]' : 'text-[18px]';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <StudioDeskMark className={`${mark} shrink-0 ${onDark ? 'drop-shadow-[0_4px_14px_rgba(61,82,160,0.45)]' : ''}`} />
      <span className="flex flex-col leading-none">
        <span className={`${word} tracking-[-0.02em] ${onDark ? 'text-white' : 'text-[#0A1B33]'}`}>
          <span className="font-medium opacity-70">The</span>
          <span className="font-extrabold">StudioDesk</span>
        </span>
        {byline && (
          <span className={`mt-1 text-[10px] font-bold uppercase tracking-[0.22em] ${onDark ? 'text-white/50' : 'text-slate-400'}`}>
            by {BRAND.company}
          </span>
        )}
      </span>
    </span>
  );
};

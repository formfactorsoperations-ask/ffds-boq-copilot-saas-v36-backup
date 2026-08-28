import React from 'react';

interface WavyTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text with each character on a staggered vertical loop, creating a waving/rippling effect.
 * Staggered per character with animation delay so the wave reads as one fluid movement.
 */
export const WavyText: React.FC<WavyTextProps> = ({ text, className = '' }) => (
  <span className={`page-header-wave ${className}`} aria-label={text}>
    {Array.from(text).map((ch, i) => (
      <span key={`${ch}-${i}`} aria-hidden="true" style={{ animationDelay: `${i * 55}ms` }}>
        {ch}
      </span>
    ))}
  </span>
);

export default WavyText;

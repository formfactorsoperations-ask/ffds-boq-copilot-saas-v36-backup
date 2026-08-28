/**
 * DOCUMENT THUMBNAIL
 *
 * A miniature of the real document, rendered from the frozen issue through the
 * same DocumentRenderer the client reads. It is not a drawing of a document —
 * it is the document, scaled down and clipped, which is why it can be trusted
 * as a preview: if the thumbnail is wrong, what the client received is wrong.
 *
 * Rendering a full sheet at scale is not free, so this is used where the studio
 * has already chosen to look at one document (the detail view), never once per
 * card across a whole grid.
 */

import React from 'react';
import { DocumentIssue } from '../../types';
import DocumentRenderer from './DocumentRenderer';

export interface DocumentThumbnailProps {
  issue: DocumentIssue;
  studioName?: string;
  /** Rendered width of the sheet before scaling. */
  sheetWidth?: number;
  /** How far down the sheet the preview reaches. */
  height?: number;
  scale?: number;
  /** Shown over the paper — usually the document's state. */
  stamp?: { label: string; cls: string } | null;
  onOpen?: () => void;
}

const DocumentThumbnail: React.FC<DocumentThumbnailProps> = ({
  issue,
  studioName,
  sheetWidth = 820,
  height = 260,
  scale = 0.42,
  stamp,
  onOpen
}) => {
  return (
    <div
      onClick={onOpen}
      className={`relative rounded-xl border border-slate-200 bg-slate-100 overflow-hidden ${
        onOpen ? 'cursor-pointer group' : ''
      }`}
      style={{ height }}
    >
      {/* The paper. Inert — pointer events off so clicks reach the card, and
          the client's own query affordances never fire from a preview. */}
      <div
        className="absolute left-1/2 top-3 bg-white shadow-sm pointer-events-none select-none"
        style={{
          width: sheetWidth,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'top center'
        }}
        aria-hidden="true"
      >
        <DocumentRenderer issue={issue} surface="studio" studioName={studioName} />
      </div>

      {/* Fades the cut edge so the sheet reads as continuing, not truncated. */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-100 to-transparent pointer-events-none" />

      {stamp && (
        <span
          className={`absolute top-2.5 right-2.5 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md ${stamp.cls}`}
        >
          {stamp.label}
        </span>
      )}

      {onOpen && (
        <span className="absolute inset-x-0 bottom-0 py-2 text-center text-[11px] font-bold text-[#0066CC] opacity-0 group-hover:opacity-100 transition-opacity">
          Open full document
        </span>
      )}
    </div>
  );
};

export default DocumentThumbnail;

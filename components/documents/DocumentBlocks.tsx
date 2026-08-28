/**
 * DOCUMENT BLOCK PRIMITIVES
 *
 * Lifted verbatim out of TermsDocketPage's local `renderBlock()` so the client
 * portal can render the same document the studio authored, rather than the
 * hardcoded summary it showed before.
 *
 * Everything here is pure. No state, no context reads — a block plus the
 * settings it needs, in; markup out. That is what lets the studio page, the
 * client Reading Room and the print view stay byte-identical.
 */

import React from 'react';
import { TermsSectionBlock, TermsSettings } from '../../types';
import { MessageCircleQuestion } from 'lucide-react';

export type DocumentSurface = 'studio' | 'portal' | 'print';

/** Replaces the {{token}} placeholders authored into clause text. */
export function resolveTokens(
  text: string,
  settings: TermsSettings | null | undefined,
  studioName: string
): string {
  if (!text) return '';
  const missing = '[set in Studio Settings]';
  return text
    .replace(/\{\{studioName\}\}/g, studioName || missing)
    .replace(/\{\{studioFoundedYear\}\}/g, settings?.studioFoundedYear?.toString() || missing)
    .replace(/\{\{changeRequestResponseDays\}\}/g, settings?.changeRequestResponseDays?.toString() || missing)
    .replace(/\{\{paymentOverdueGraceDays\}\}/g, settings?.paymentOverdueGraceDays?.toString() || missing)
    .replace(/\{\{resumeAfterPaymentDays\}\}/g, settings?.resumeAfterPaymentDays?.toString() || missing)
    .replace(/\{\{paymentMethods\}\}/g, settings?.paymentMethods?.join(' / ') || missing)
    .replace(/\{\{gstRate\}\}/g, settings?.gstRate?.toString() || missing)
    .replace(/\{\{includedRevisionRounds\}\}/g, settings?.includedRevisionRounds?.toString() || missing)
    .replace(/\{\{disputeMediationDays\}\}/g, settings?.disputeMediationDays?.toString() || missing)
    .replace(/\{\{disputeJurisdiction\}\}/g, settings?.disputeJurisdiction || missing);
}

/** Plain text of a block — used as the verbatim excerpt on a clause query. */
export function blockPlainText(
  block: TermsSectionBlock,
  settings: TermsSettings | null | undefined,
  studioName: string
): string {
  return resolveTokens(block.text || block.intro || block.label || '', settings, studioName);
}

interface BlockProps {
  block: TermsSectionBlock;
  settings: TermsSettings | null | undefined;
  studioName: string;
  surface: DocumentSurface;
  /** When provided, each clause offers a way to question it. */
  onQuery?: (ref: string, excerpt: string) => void;
  /** Refs changed since the reader last saw this document. */
  highlighted?: boolean;
}

/** The "Ask about this" affordance. Absent from print, and from read-only views. */
interface QueryHandleProps {
  onQuery?: (ref: string, excerpt: string) => void;
  refId: string;
  excerpt: string;
}

const QueryHandle: React.FC<QueryHandleProps> = ({ onQuery, refId, excerpt }) => {
  if (!onQuery) return null;
  return (
    <button
      type="button"
      onClick={() => onQuery(refId, excerpt)}
      className="doc-query-handle opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-[#0066CC] hover:bg-[#0066CC]/10 cursor-pointer"
      title={`Ask a question about clause ${refId}`}
    >
      <MessageCircleQuestion className="w-3.5 h-3.5" />
      Ask about this
    </button>
  );
};

export const ClauseBlock: React.FC<BlockProps> = ({ block, settings, studioName, surface, onQuery, highlighted }) => {
  const processed = resolveTokens(block.text || '', settings, studioName);
  const refId = block.ref || '';

  return (
    <div
      className={`cl group flex items-start gap-3 ${highlighted ? 'bg-amber-50/70 -mx-3 px-3 py-2 rounded-lg border-l-2 border-amber-400' : ''}`}
      data-clause-ref={refId}
    >
      {refId && (
        <div className="num shrink-0 font-mono text-[11px] font-bold text-slate-400 pt-0.5 w-9 tabular-nums">
          {refId}
        </div>
      )}
      <div className="body flex-1 min-w-0">{processed}</div>
      {surface !== 'print' && (
        <QueryHandle onQuery={onQuery} refId={refId} excerpt={processed} />
      )}
    </div>
  );
};

export const CalloutBlock: React.FC<BlockProps> = ({ block, settings, studioName, surface, onQuery, highlighted }) => {
  const processed = resolveTokens(block.text || '', settings, studioName);
  const isHighlight = block.style === 'highlight';

  return (
    <div
      className={`group ${isHighlight ? 'highlight bg-amber-50 border-amber-500' : 'principle bg-slate-50 border-[#0066CC]'} ${
        highlighted ? 'ring-2 ring-amber-400' : ''
      } highlight-box border-l-4 py-3 pl-4 pr-3 rounded-r-md my-4 shadow-sm`}
      style={{ pageBreakInside: 'avoid' }}
      data-clause-ref={block.ref || block.label || ''}
    >
      <div className="flex items-start justify-between gap-2">
        {block.label && (
          <h3
            className={`font-bold ${
              isHighlight ? 'text-amber-900' : 'text-slate-800'
            } text-[11px] tracking-wider mb-2 m-0 uppercase lab`}
          >
            {block.label}
          </h3>
        )}
        {surface !== 'print' && (
          <QueryHandle onQuery={onQuery} refId={block.ref || block.label || ''} excerpt={processed} />
        )}
      </div>
      {processed.split('\n\n').map((para, i) => (
        <p
          key={i}
          className={`m-0 ${i === 0 && !isHighlight ? 'font-semibold text-slate-800' : 'text-slate-600 mt-2'}`}
        >
          {para}
        </p>
      ))}
    </div>
  );
};

export const TableBlock: React.FC<BlockProps> = ({ block, settings, highlighted }) => {
  let columns: string[] = [];
  let data: [string, string][] = [];

  if (block.source === 'snagCategories' && settings?.snagCategories) {
    columns = ['Category', 'Resolution Timeframe'];
    data = settings.snagCategories.map(c => [
      `Category ${c.label}`,
      `${c.resolveDays} working days`
    ]);
  } else if (block.source === 'warrantyPeriods' && settings?.warrantyPeriods) {
    columns = ['Trade / Component', 'Warranty Period'];
    data = settings.warrantyPeriods.map(w => {
      const years = w.months / 12;
      const duration =
        w.months >= 12 && w.months % 12 === 0
          ? `${years} Year${years > 1 ? 's' : ''}`
          : `${w.months} Months`;
      return [w.trade, duration];
    });
  }

  if (data.length === 0) return null;

  return (
    <div className={`my-4 ${highlighted ? 'ring-2 ring-amber-400 rounded-lg p-2' : ''}`} data-clause-ref={block.ref || ''}>
      {block.intro && <p className="mb-2 font-semibold">{block.intro}</p>}
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="mini w-full text-left border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="py-2 px-3 border-b border-slate-200 font-bold text-slate-700 text-[10px] uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 px-3 text-slate-800 font-semibold text-[11px]">{row[0]}</td>
                <td className="py-2 px-3 text-slate-600 text-[11px] tabular-nums">{row[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className="text-[10px] text-slate-500 italic mt-1">{block.note}</p>}
    </div>
  );
};

/** Dispatches a block to its renderer. */
export const DocumentBlock: React.FC<BlockProps> = (props) => {
  const { block } = props;
  if (block.type === 'clause') return <ClauseBlock {...props} />;
  if (block.type === 'callout') return <CalloutBlock {...props} />;
  if (block.type === 'table') return <TableBlock {...props} />;
  return null;
};

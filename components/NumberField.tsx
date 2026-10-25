import React, { useRef, useState } from 'react';
import { parseNumberInput, formatNumberInput } from '../lib/numberInput';

/*
  A number box that keeps what you type.

  While the box has focus it holds its own text: nothing redraws it from the
  saved value, so "0" never appears in an emptied box, "12." stays "12." until
  the 5 arrives, and a figure worked out from others (a cost split into
  material and labour) cannot rewrite itself under the cursor. Clicking in
  selects the figure, so typing replaces it as in a spreadsheet.

  `live` saves each complete number as it is typed, so totals move with the
  keys; leave it off for a figure that feeds others, and it saves on Enter or
  leaving the box. Escape puts back what was there. A box emptied and left
  goes back to its old figure, unless `allowEmpty`.

  It is a text box with a decimal keypad rather than type="number": that one
  rejects "3,200", changes the figure when the page is scrolled over it, and
  hides half-typed values from the code.
*/
export interface NumberFieldProps {
  value: number | null | undefined;
  onCommit: (value: number | undefined) => void;
  live?: boolean;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  /** Decimals shown when the box is not being edited. */
  decimals?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  id?: string;
  'aria-label'?: string;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
  /** Called after the box is left, for callers that close an editor then. */
  onDone?: () => void;
  autoFocus?: boolean;
}

const NumberField: React.FC<NumberFieldProps> = ({
  value, onCommit, live = true, allowEmpty = false, min, max, decimals = 2,
  className = '', placeholder, disabled, title, id, onClick, onDone, autoFocus, ...rest
}) => {
  const shown = formatNumberInput(value, decimals);
  const [draft, setDraft] = useState<string | null>(null);
  const atFocus = useRef<number | null | undefined>(value);
  const committed = useRef(false);
  const escaping = useRef(false);
  /* A click selects on focus, then Chrome's mouseup drops the selection; the
     first mouseup after focus is told not to. Selecting a frame later instead
     raced fast typing and swallowed its first key. */
  const keepSelection = useRef(false);

  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const commit = (n: number | undefined) => {
    committed.current = true;
    if (n === undefined ? value !== undefined && value !== null : n !== value) onCommit(n);
  };

  const finish = (text: string) => {
    if (escaping.current) {
      // Escape: whatever a live box saved while typing is taken back.
      escaping.current = false;
      if (live && committed.current && atFocus.current !== value) onCommit(atFocus.current ?? undefined);
      setDraft(null);
      onDone?.();
      return;
    }
    // "12." left in the box means 12.
    const p = parseNumberInput(text.trim().replace(/\.$/, ''));
    if (p.kind === 'number') commit(clamp(p.value));
    else if (p.kind === 'empty' && allowEmpty) commit(undefined);
    // Empty, half-typed or unreadable: the figure the box had when it was
    // entered stands. A live box may already have saved part of the typing.
    else if (live && committed.current && atFocus.current !== value) onCommit(atFocus.current ?? undefined);
    setDraft(null);
    onDone?.();
  };

  return (
    <input
      {...rest}
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      autoFocus={autoFocus}
      disabled={disabled}
      title={title}
      placeholder={placeholder}
      value={draft ?? shown}
      onClick={onClick}
      onFocus={e => {
        atFocus.current = value;
        committed.current = false;
        setDraft(shown);
        e.currentTarget.select();
        keepSelection.current = true;
      }}
      onMouseUp={e => {
        if (keepSelection.current) { e.preventDefault(); keepSelection.current = false; }
      }}
      onChange={e => {
        keepSelection.current = false;
        const text = e.target.value;
        setDraft(text);
        if (!live) return;
        const p = parseNumberInput(text);
        if (p.kind === 'number' && inRange(p.value)) commit(p.value);
      }}
      onBlur={e => finish(e.currentTarget.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          escaping.current = true;
          e.currentTarget.blur();
        }
      }}
      className={`tabular-nums ${className}`}
    />
  );
};

export default NumberField;

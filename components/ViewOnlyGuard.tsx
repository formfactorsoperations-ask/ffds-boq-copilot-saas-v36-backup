import React from 'react';

/**
 * Makes whatever it wraps look-but-don't-touch.
 *
 * A Designer may read the Timeline, Decisions, Brief & Site and Design Gate,
 * but change only drawings. Those screens were built for the studio and are
 * full of edit controls -- "Log a Decision", "Add stage", drag-to-reschedule,
 * inline inputs -- and a banner saying "view only" did not stop any of them.
 *
 * One layer that does not depend on each screen remembering a read-only prop:
 * capture-phase handlers that swallow clicks, pointer and mouse presses, drags,
 * typing, pasting and form submits before any control inside sees them. That
 * covers inputs and buttons as well as the clickable rows and draggable bars
 * that are not form controls. (A disabled <fieldset> would do inputs too, but
 * it also disables the view controls below, which are worth keeping.)
 *
 * A few controls only change how the screen is shown -- zoom, filters, the
 * legend -- and are let through by their label, so the screens stay readable.
 * Scrolling is untouched. Saves from this session are also switched off in
 * dbService and refused by the Firestore rules; this is the layer the person
 * actually sees.
 */

/* Labels of controls that change only the view. Matched against a button's
   own text, lower-cased and trimmed, so a control is let through only when
   it plainly says what it does. */
const VIEW_CONTROLS = [
  /^day$/, /^week$/, /^month$/, /^all(\s*\d+)?$/, /^design(\s*\d+)?$/, /^site(\s*\d+)?$/,
  /^legend/, /^baseline$/, /^timeline$/, /^data trail$/, /^show (more|less)/, /^expand/, /^collapse/,
];

const isViewControl = (target: EventTarget | null): boolean => {
  const el = target instanceof Element ? target.closest('button, [role="tab"]') : null;
  if (!el) return false;
  const label = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return VIEW_CONTROLS.some((re) => re.test(label));
};

interface Props {
  active: boolean;
  children: React.ReactNode;
}

export default function ViewOnlyGuard({ active, children }: Props) {
  if (!active) return <>{children}</>;

  const swallow = (e: React.SyntheticEvent) => {
    if (isViewControl(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      data-view-only="true"
      onClickCapture={swallow}
      onDoubleClickCapture={swallow}
      onPointerDownCapture={swallow}
      onMouseDownCapture={swallow}
      onDragStartCapture={swallow}
      onKeyDownCapture={(e) => { if (!['Tab', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) swallow(e); }}
      onPasteCapture={swallow}
      onDropCapture={swallow}
      onBeforeInputCapture={swallow}
      onSubmitCapture={swallow}
      className="view-only-guard"
    >
      {children}
    </div>
  );
}

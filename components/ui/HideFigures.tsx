import React, { useEffect, useSyncExternalStore } from 'react';
import { Eye, EyeOff } from '@/lib/lucide-shim';
import { figuresHidden, setFiguresHidden, subscribeFiguresHidden, toggleFiguresHidden, isHideFiguresShortcut } from '../../lib/figuresPrivacy';
import { seesStudioFinance } from '../../lib/roleAccess';
import type { RoleSet } from '../../lib/roles';
import { EmptyState, Button } from './kit';

/*
  The "Hide figures" switch (lib/figuresPrivacy): a button in the top bar and
  in the project page bar, and what it does to a screen.

  It hides MARGINS: margin and profit, and the cost and buy rates they come
  from. Prices, payment plans and collections stay, so a screen shared in a
  pitch still works. On a project screen a margin figure turns to dots
  (`Masked`) and a panel made of nothing else says so in its place
  (`MarginsHidden`). Only the two studio screens made of margins from end to
  end, Reports and the item bank, are covered whole (`FiguresHiddenCover`).
*/

/** Whether figures are hidden now. Redraws the caller when it changes. */
export const useFiguresHidden = (): boolean =>
  useSyncExternalStore(subscribeFiguresHidden, figuresHidden, () => false);

/** `seesMargins` (lib/roleAccess) as a hook, so the caller redraws when figures are hidden or shown. */
export const useSeesMargins = (role?: RoleSet): boolean => {
  const hidden = useFiguresHidden();
  return seesStudioFinance(role) && !hidden;
};

/**
 * A margin, cost or profit figure: as it is, or dots while figures are
 * hidden. The dots keep the figure's own type, so the layout does not move.
 */
export const Masked: React.FC<{ children: React.ReactNode; dots?: string }> = ({ children, dots = '••••' }) => {
  const hidden = useFiguresHidden();
  if (!hidden) return <>{children}</>;
  return (
    <span title="Hidden while figures are hidden (Alt+Shift+H)" aria-label="Hidden" className="tracking-widest select-none">{dots}</span>
  );
};

/** In place of a panel's contents when all it shows is margin or cost. */
export const MarginsHidden: React.FC<{ what?: string; className?: string }> = ({ what = 'Margins', className }) => (
  <EmptyState
    icon={EyeOff}
    title={`${what} hidden`}
    text="Hidden for a shared screen. Prices and payments stay."
    action={<Button size="sm" variant="quiet" icon={Eye} onClick={() => setFiguresHidden(false)}>Show</Button>}
    className={className}
  />
);

/** Alt+Shift+H anywhere in the app. Mount once, at the top. */
export function useHideFiguresShortcut(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isHideFiguresShortcut(e)) return;
      e.preventDefault();
      toggleFiguresHidden();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/**
 * The switch: an icon button the size and shape of the notification bell
 * beside it, so the two read as a pair. Open eye when figures show; when they
 * are hidden the eye closes (the two icons cross over on a plain 300ms
 * transition), the button takes the brand tint and a brand dot sits on it.
 * Shown only to the roles that see the studio's money in the first place.
 */
export const HideFiguresButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const hidden = useFiguresHidden();
  const swap = 'absolute inset-0 m-auto w-[18px] h-[18px] transition-all duration-300 ease-out motion-reduce:transition-none';
  return (
    <button
      type="button"
      onClick={toggleFiguresHidden}
      aria-pressed={hidden}
      aria-label={hidden ? 'Margins hidden. Show them' : 'Hide margins'}
      title={hidden
        ? 'Margins hidden: margin, profit and cost are off the screen; prices and payments stay. Click to show them (Alt+Shift+H).'
        : 'Hide margins while you share your screen: margin, profit and cost. Prices and payments stay (Alt+Shift+H).'}
      className={`relative w-10 h-10 shrink-0 grid place-items-center rounded-xl transition-colors cursor-pointer outline-none
        focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${hidden
          ? 'bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0]/15'
          : 'text-slate-500 hover:bg-sky-50 hover:text-slate-700'} ${className}`}
    >
      <span className="relative block w-[18px] h-[18px]" aria-hidden>
        <Eye className={`${swap} ${hidden ? 'opacity-0 scale-75 -rotate-12' : 'opacity-100 scale-100 rotate-0'}`} />
        <EyeOff className={`${swap} ${hidden ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-12'}`} />
      </span>
      {hidden && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#3D52A0] ring-2 ring-white" aria-hidden />}
    </button>
  );
};

/** Over Reports or the item bank (MARGIN_SCREENS in lib/roleAccess) while figures are hidden. */
export const FiguresHiddenCover: React.FC = () => (
  <div className="absolute inset-0 z-30 bg-[#F4F7FB]">
    <div className="sticky top-6 max-w-md mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><EyeOff className="w-4 h-4" /></span>
        <div className="min-w-0">
          <p className="font-bold text-slate-800">Figures are hidden</p>
          <p className="text-xs text-slate-500 mt-1">
            This screen is made of margins and costs from end to end, so it stays covered while figures are
            hidden. Project screens stay open and hide only their margins.
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={() => setFiguresHidden(false)}
          className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] inline-flex items-center gap-2">
          <Eye className="w-4 h-4" />Show figures
        </button>
      </div>
    </div>
  </div>
);

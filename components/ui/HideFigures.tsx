import React, { useEffect, useSyncExternalStore } from 'react';
import { Eye, EyeOff } from '@/lib/lucide-shim';
import { figuresHidden, setFiguresHidden, subscribeFiguresHidden, toggleFiguresHidden, isHideFiguresShortcut } from '../../lib/figuresPrivacy';

/*
  The "Hide figures" switch (lib/figuresPrivacy): a button in the top bar and
  in the project hub's row, the cover over a screen that is wholly about money,
  and the hook that makes the app redraw when it is flipped.
*/

/** Whether figures are hidden now. Redraws the caller when it changes. */
export const useFiguresHidden = (): boolean =>
  useSyncExternalStore(subscribeFiguresHidden, figuresHidden, () => false);

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
      aria-label={hidden ? 'Figures hidden. Show them' : 'Hide figures'}
      title={hidden
        ? 'Figures hidden: margins, costs and collections are off the screen. Click to show them (Alt+Shift+H).'
        : 'Hide figures while you share your screen: margins, costs and collections (Alt+Shift+H).'}
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

/** Over a screen that is wholly about the studio's money, while figures are hidden. */
export const FiguresHiddenCover: React.FC = () => (
  <div className="absolute inset-0 z-30 bg-[#F4F7FB]">
    <div className="sticky top-6 max-w-md mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><EyeOff className="w-4 h-4" /></span>
        <div className="min-w-0">
          <p className="font-bold text-slate-800">Figures are hidden</p>
          <p className="text-xs text-slate-500 mt-1">
            This screen is about the studio&rsquo;s money: margins, costs and collections. It stays covered while
            figures are hidden, so it is safe to share your screen.
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

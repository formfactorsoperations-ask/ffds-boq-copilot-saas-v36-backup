import React from 'react';
import { getPageMeta } from './pageMeta';
import { usePageHeaderSlots } from '../contexts/PageHeaderContext';
import WavyText from './ui/WavyText';
import FlipText from './ui/flip-text';

interface Props {
  route: string;
}

/**
 * The standard page title block. Rendered once by the shell for every route —
 * pages never build their own.
 *
 * Layout is a single row: name, then vitals, then views and actions right-aligned.
 * There is deliberately no container, no card and no tint: the project bar, stage
 * stepper, sub-tabs and Project Hub rail already sit above this, and a fifth box
 * would read as another widget rather than as the page's name.
 *
 * Every class here is one the theme overrides in index.html already retarget, so
 * the block survives all four themes. Never add `font-[...]` — it defeats the
 * font switcher in Studio Settings.
 */
const PageTitleBlock: React.FC<Props> = ({ route }) => {
  const meta = getPageMeta(route);
  const { badge, vitals, views, actions } = usePageHeaderSlots();

  if (!meta) return null;

  const hasTail = Boolean(views || actions);
  const hasVitals = Boolean(vitals && vitals.length);

  return (
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap pb-3 mb-4 border-b border-slate-200 print:hidden">
      {/* Name. h2 because the project name in the top bar is already the h1. */}
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 whitespace-nowrap flex items-center">
        {/* Plays once on mount. Looping meant every page heading re-scrambled
            itself every 2.5s forever -- a title caught mid-flip is unreadable,
            and a permanent animation competes with the content under it. */}
        <FlipText duration={2.5} loop={false}>
          {meta.title}
        </FlipText>
        {badge && (
          <span className="ml-2.5 align-middle inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-[#3D52A0] border border-sky-100">
            {badge}
          </span>
        )}
      </h2>

      {/* The note keeps its place when there are no vitals; alongside vitals it
          only appears on wide screens, so it never squeezes the figures. */}
      {meta.subtitle && (
        <WavyText
          text={meta.subtitle}
          className={`text-xs sm:text-sm text-slate-500 font-medium whitespace-nowrap overflow-hidden ${
            hasVitals ? 'hidden xl:inline-block' : 'inline-block'
          }`}
        />
      )}

      {hasVitals && (
        <div className="flex items-center flex-wrap gap-y-1">
          {vitals.slice(0, 4).map((v, i) => (
            <div
              key={v.label}
              className={`pr-4 ${i < Math.min(vitals.length, 4) - 1 ? 'mr-4 border-r border-slate-200/60' : ''}`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {v.label}
              </div>
              <div
                className={`text-xs sm:text-[13px] font-bold tracking-tight tabular-nums leading-tight ${
                  v.tone === 'good'
                    ? 'text-emerald-600'
                    : v.tone === 'warn'
                    ? 'text-amber-600'
                    : 'text-slate-900'
                }`}
              >
                {v.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasTail && (
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {views}
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageTitleBlock;

import React, { useEffect, useState } from 'react';
import { RefreshCw } from '@/lib/lucide-shim';
import { BUILD_ID, hardRefresh, isNewer, latestBuild } from '../../lib/appVersion';

/* Ask again every five minutes, and whenever StudioDesk comes back to the front. */
const EVERY = 5 * 60 * 1000;

/** Whether the site now serves a newer StudioDesk than this page runs (lib/appVersion.ts). */
export function useNewVersion(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!BUILD_ID || ready) return;
    let alive = true;
    const check = () => { latestBuild().then((b) => { if (alive && isNewer(b)) setReady(true); }); };
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const t = window.setInterval(check, EVERY);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', check);
    };
  }, [ready]);
  return ready;
}

/**
 * Load the latest StudioDesk: an icon button the size and shape of the bell,
 * like Hide figures beside it. When a newer version is out it takes the brand
 * tint and a brand dot, and says so.
 */
export const RefreshAppButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const ready = useNewVersion();
  const [busy, setBusy] = useState(false);
  const go = () => { if (busy) return; setBusy(true); hardRefresh(); };
  return (
    <button
      type="button"
      onClick={go}
      aria-label={ready ? 'A new version of StudioDesk is ready. Load it' : 'Refresh StudioDesk'}
      title={ready
        ? 'A new version of StudioDesk is ready. Click to load it.'
        : 'Refresh StudioDesk: load the latest version and the latest data.'}
      className={`relative w-10 h-10 shrink-0 grid place-items-center rounded-xl transition-colors cursor-pointer outline-none
        focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${ready
          ? 'bg-[#3D52A0]/10 text-[#3D52A0] hover:bg-[#3D52A0]/15'
          : 'text-slate-500 hover:bg-sky-50 hover:text-slate-700'} ${className}`}
    >
      <RefreshCw className={`w-[18px] h-[18px] ${busy ? 'animate-spin' : ''}`} aria-hidden />
      {ready && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#3D52A0] ring-2 ring-white" aria-hidden />}
    </button>
  );
};

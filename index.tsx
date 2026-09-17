
import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import './src/depth3d';
import App from './App';
import { MotionConfig } from 'framer-motion';
import { OrgProvider } from './contexts/OrgContext';

// Suppress Vite WebSocket connection errors in preview environment
const isViteNoise = (...args: any[]) => {
  return args.some(arg => {
    if (typeof arg === 'string') {
      return (
        arg.includes('[vite]') || 
        arg.includes('WebSocket') || 
        arg.includes('WebChannel') || 
        arg.includes('failed to connect to websocket') || 
        arg.includes('transport errored') ||
        arg.includes('server connection lost')
      );
    }
    if (arg && typeof arg === 'object') {
      const msg = ((arg as any).message || '') + ' ' + ((arg as any).reason || '') + ' ' + ((arg as any).stack || '');
      return (
        msg.includes('[vite]') || 
        msg.includes('WebSocket') || 
        msg.includes('WebChannel') || 
        msg.includes('failed to connect to websocket') || 
        msg.includes('transport errored') ||
        msg.includes('server connection lost')
      );
    }
    return false;
  });
};

/*
  Patch console once per page, not once per module evaluation.

  This module gets evaluated more than once in dev (Vite re-executes it, and it
  is reachable as both /index.tsx and /src/index.tsx). Each pass captured the
  console.warn that the previous pass had already installed and wrapped it
  again, so a single warning walked a chain of wrappers that grew with every
  reload until it blew the stack -- "Maximum call stack size exceeded" at this
  line, thrown before the app had finished mounting. The flag makes re-running
  this file a no-op.
*/
const consoleHost = window as any;
if (!consoleHost.__ffdsConsolePatched) {
  consoleHost.__ffdsConsolePatched = true;

  /*
    Re-entrancy guard.

    Whatever we capture here may itself be somebody else's wrapper -- Vite's
    client, a devtools bridge, the preview harness -- and if that wrapper logs
    through the live console.warn rather than the native one, the two call each
    other until the stack blows. That is not hypothetical: it is what filled the
    console with 80,000 "Maximum call stack size exceeded" frames and stopped
    the app mounting at all. A flag makes the cycle impossible no matter who
    else is in the chain.
  */
  let inError = false;
  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (inError) return;
    inError = true;
    try {
      if (isViteNoise(...args)) {
        return; // Suppress Vite HMR / websocket noise in iframe preview
      }
      originalConsoleError(...args);
    } finally {
      inError = false;
    }
  };

  let inWarn = false;
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    if (inWarn) return;
    inWarn = true;
    try {
      if (isViteNoise(...args)) {
        return;
      }
      originalConsoleWarn(...args);
    } finally {
      inWarn = false;
    }
  };
}

window.addEventListener('unhandledrejection', (event) => {
  let reasonStr = '';
  if (event.reason instanceof Error) {
    reasonStr = event.reason.message;
  } else if (typeof event.reason === 'string') {
    reasonStr = event.reason;
  } else if (event.reason && typeof event.reason === 'object') {
    try { reasonStr = JSON.stringify(event.reason); } catch(e) {}
    if (event.reason?.message) reasonStr += ' ' + event.reason.message;
  }
  
  if (reasonStr.includes('WebSocket') || reasonStr.includes('WebChannel') || reasonStr.includes('transport errored')) {
    event.preventDefault();
  }
});

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isImportError = this.state.error?.message?.includes('Failed to fetch dynamically imported module');
      return (
        <div style={{ 
          padding: '32px 24px', 
          background: '#FDFBF7', 
          color: '#003D7A', 
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            background: '#FFFFFF',
            padding: '28px',
            borderRadius: '16px',
            border: '1px solid #BAE6FD',
            boxShadow: '0 4px 12px rgba(61, 82, 160, 0.06)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: '#0052A3' }}>
              {isImportError ? 'Session Updated' : 'Application Notice'}
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              {isImportError 
                ? 'A new version of the studio interface is available. Please reload to apply the update.'
                : (this.state.error?.message || "An unexpected error occurred.")}
            </p>
            <button 
              onClick={() => {
                sessionStorage.removeItem("chunk_reload_done");
                window.location.reload();
              }} 
              style={{ 
                padding: '10px 20px', 
                background: '#3D52A0', 
                color: '#ffffff', 
                border: 'none', 
                borderRadius: '8px', 
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(61, 82, 160, 0.2)'
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

/*
  Evict any service worker left over from when the PWA plugin had devOptions
  enabled.

  Turning that option off stops NEW registrations but does nothing about a
  worker already installed in a developer's browser: it keeps controlling the
  page and serving its cached copy of the module graph. That cache included
  Vite's own client, whose HMR token no longer matches the running server, so
  the socket is refused -- and the client reports that failure through
  sendError, which dereferences the socket it does not have and re-enters
  itself until the stack blows.

  Nothing registers a worker in this app any more, so in dev there is never a
  legitimate one to keep. Production registration is untouched.
*/
if (import.meta.env.DEV && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});

  if (typeof caches !== "undefined") {
    caches
      .keys()
      .then((keys) => keys.forEach((k) => caches.delete(k)))
      .catch(() => {});
  }
}

console.log("index.tsx starting");
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
console.log("Found root element, creating root...");
const root = ReactDOM.createRoot(rootElement);
console.log("Root created, rendering...");
/*
  StrictMode, on by default.

  It mounts every component twice in dev, so each of this app's 25 onSnapshot
  listeners subscribes, tears down and resubscribes within a frame. Several of
  them watch the same Firestore path from different components, and the SDK
  shares one watch target between those under a reference count — which firebase
  12.10.0 could drive negative, throwing INTERNAL ASSERTION FAILED (ID: b815 /
  ca9, CONTEXT {"ve":-1}) and killing the client until the page reloaded.

  That was an SDK bug, not a defect in the effects here: all 25 clean up
  correctly. It was worked around by disabling StrictMode, which cost the
  double-mount checks — the very thing that catches a listener someone forgets
  to unsubscribe. Firebase 12.13.0 fixed it, verified by turning StrictMode back
  on and opening the screen that used to crash.

  `ffds_strict_mode` is now an escape hatch rather than a switch: set it to
  'false' in localStorage and reload if the assertion ever returns, which would
  mean a regression worth reporting upstream rather than living with quietly.
*/
const wantsStrictMode = (() => {
  try { return localStorage.getItem('ffds_strict_mode') !== 'false'; }
  catch { return true; }
})();

const appTree = (
    <ErrorBoundary>
      <React.Suspense fallback={
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f8fafc] select-none overflow-hidden relative">
          {/* Soft high-tech background grids & glowing spots */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_65%)]" />

          <div className="relative flex flex-col items-center justify-center z-10">
            {/* GLASS ARC REACTOR HOUSING */}
            <div className="relative w-36 h-36 flex items-center justify-center bg-white/70 backdrop-blur-xl rounded-full border border-slate-200/80 shadow-[0_12px_40px_rgba(31,38,135,0.06),inset_0_0_20px_rgba(255,255,255,0.6)]">
              
              {/* Outer HUD Ring (Slow Counter-Clockwise Rotation) */}
              <div className="absolute w-32 h-32 rounded-full border border-dashed border-sky-500/15 animate-[spin_25s_linear_infinite_reverse]" />
              
              {/* Outer Segmented Ring with Gaps */}
              <div className="absolute w-28 h-28 rounded-full border-2 border-sky-500/20 border-t-transparent border-b-transparent animate-[spin_10s_linear_infinite]" />
              
              {/* Golden/Brass Outer Containment Ring - matching the gold theme palette */}
              <div className="absolute w-24 h-24 rounded-full border-4 border-double border-amber-500/25 opacity-80 animate-[spin_15s_linear_infinite_reverse]" />

              {/* 8 Radial Magnetic Coils (Glow Core Panels in Gold/Indigo) */}
              <div className="absolute inset-0 flex items-center justify-center animate-[spin_18s_linear_infinite]">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2.5 h-5 bg-sky-500/15 rounded-[1px] border border-sky-400/20"
                    style={{
                      transform: `rotate(${i * 45}deg) translateY(-26px)`,
                      boxShadow: '0 0 6px rgba(99,102,241,0.1)'
                    }}
                  />
                ))}
              </div>

              {/* Inner High-Frequency Plasma Flux (Very Fast Spin) */}
              <div className="absolute w-14 h-14 rounded-full border border-sky-500 border-l-transparent border-r-transparent animate-[spin_1.2s_linear_infinite] shadow-[0_0_12px_rgba(99,102,241,0.2)]" />

              {/* Main Core: Highly Concentrated Glow Core */}
              <div className="relative w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.35),0_0_40px_rgba(99,102,241,0.15),inset_0_0_2px_rgba(99,102,241,0.5)] border border-sky-100">
                <div className="w-6 h-6 rounded-full bg-sky-50 border border-sky-200 animate-ping absolute opacity-40" style={{ animationDuration: '2s' }} />
                <div className="w-4 h-4 rounded-full bg-sky-600/20 border border-sky-400 animate-pulse" />
              </div>

              {/* Fine HUD Crosshair lines */}
              <div className="absolute w-36 h-[1px] bg-slate-400/5" />
              <div className="absolute h-36 w-[1px] bg-slate-400/5" />
            </div>
          </div>
        </div>
      }>
        {/*
          One switch for every framer-motion animation in the app.

          `reducedMotion="user"` makes framer read the OS setting and drop
          transform and layout animations for anyone who has asked for less
          motion. The CSS animations already honour that media query; the
          JS-driven ones did not, and there are a lot of them now.
        */}
        <MotionConfig reducedMotion="user">
          <OrgProvider>
            <App />
          </OrgProvider>
        </MotionConfig>
      </React.Suspense>
    </ErrorBoundary>
);

root.render(wantsStrictMode ? <React.StrictMode>{appTree}</React.StrictMode> : appTree);

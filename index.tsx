
import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { OrgProvider } from './contexts/OrgContext';

// Suppress Vite WebSocket connection errors in preview environment
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' && 
    (args[0].includes('[vite] failed to connect to websocket') || 
     args[0].includes('WebSocket closed without opened') ||
     args[0].includes('WebSocket'))
  ) {
    return; // Suppress the specific Vite HMR error
  }
  originalConsoleError(...args);
};

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
            boxShadow: '0 4px 12px rgba(0, 102, 204, 0.06)'
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
                background: '#0066CC', 
                color: '#ffffff', 
                border: 'none', 
                borderRadius: '8px', 
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0, 102, 204, 0.2)'
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

console.log("index.tsx starting");
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
console.log("Found root element, creating root...");
const root = ReactDOM.createRoot(rootElement);
console.log("Root created, rendering...");
root.render(
  <React.StrictMode>
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
        <OrgProvider>
          <App />
        </OrgProvider>
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);

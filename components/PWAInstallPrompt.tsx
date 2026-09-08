import React, { useState } from 'react';
import { Download, Smartphone, Share2, PlusSquare, X, Check, ExternalLink, QrCode } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallPromptProps {
  className?: string;
  variant?: 'button' | 'banner' | 'pill';
  sampleProjectToken?: string;
  label?: string;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  className = '',
  variant = 'button',
  sampleProjectToken = 'mmq0f5dp-l0j6ory-18_97711204',
  label = 'Install Mobile App',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  // If already installed in standalone mode, don't show prompt
  if (isInstalled) {
    return null;
  }

  const sampleUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?portal=${sampleProjectToken}`
    : `/?portal=${sampleProjectToken}`;

  const copySampleLink = async () => {
    try {
      await navigator.clipboard.writeText(sampleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  const handleInstallClick = () => {
    if (isInstallable) {
      install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      {variant === 'banner' ? (
        <div className={`bg-gradient-to-r from-sky-900 to-indigo-950 text-white rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
              <Smartphone className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h4 className="text-sm font-bold tracking-tight text-white">Install Mobile App</h4>
              <p className="text-xs text-sky-200/90 font-medium">Add to your home screen for quick 1-tap client approvals and site logs</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleInstallClick}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'Install Now' : 'App Setup Guide'}</span>
            </button>
            <button
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition cursor-pointer"
              title="View Mobile App QR / Link"
            >
              <QrCode className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : variant === 'pill' ? (
        <button
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 text-[11px] font-bold transition-all shadow-xs active:scale-95 cursor-pointer ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5 text-sky-600" />
          <span>{label}</span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{label}</span>
        </button>
      )}

      {/* Mobile App Install & Sample Link Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowGuide(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Install Mobile App (PWA)</h3>
                <p className="text-xs text-slate-500 font-medium">1-Tap home screen access with offline support</p>
              </div>
            </div>

            {/* Platform specific instructions */}
            {isIOS ? (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 mb-4 text-xs text-slate-700">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-sky-600" /> How to install on iPhone / iPad (Safari):
                </p>
                <div className="space-y-2 pl-1">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                    <span>Tap the <strong>Share</strong> button at the bottom of Safari toolbar.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                    <span>Scroll down and tap <strong>Add to Home Screen</strong> (<PlusSquare className="w-3.5 h-3.5 inline text-slate-600" />).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
                    <span>Tap <strong>Add</strong> in the top right corner. The app will launch in standalone full-screen!</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 mb-4 text-xs text-slate-700">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-sky-600" /> How to install on Android / Chrome:
                </p>
                <div className="space-y-2 pl-1">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                    <span>Tap the <strong>Install App</strong> button or open Chrome menu (<strong>⋮</strong>).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                    <span>Select <strong>Install App</strong> or <strong>Add to Home screen</strong>.</span>
                  </div>
                </div>
                {isInstallable && (
                  <button
                    onClick={async () => {
                      await install();
                      setShowGuide(false);
                    }}
                    className="w-full mt-2 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Trigger Direct Install Prompt</span>
                  </button>
                )}
              </div>
            )}

            {/* Sample Project Link Testing Section */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Sample Project Mobile Link:</span>
                <button
                  onClick={copySampleLink}
                  className="text-xs font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-mono break-all select-all border border-slate-200">
                {sampleUrl}
              </div>
              <div className="flex gap-2 pt-1">
                <a
                  href={sampleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition text-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Sample Link</span>
                </a>
                <button
                  onClick={() => setShowGuide(false)}
                  className="py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const MotionDiv = motion.div as any;

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
}

/**
 * In-app confirmation, in place of window.confirm.
 *
 * The native dialog is rendered by the browser, so it arrives with Chrome's
 * chrome, a "localhost:3000 says" header, and none of the app's typography —
 * which reads as a page error rather than a question the app is asking. It also
 * blocks the main thread, so nothing behind it can animate or respond.
 */
export default function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
}) {
  const danger = request.tone === 'danger';

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <MotionDiv
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="p-5 sm:p-6 space-y-2.5">
          <div className="flex items-start gap-3">
            <span
              className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center ${
                danger ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-[#0055B3]'
              }`}
            >
              <AlertTriangle className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <h4 className="font-extrabold text-slate-900 text-[15px] leading-snug">{request.title}</h4>
              <p className="text-[13px] text-slate-600 font-medium mt-1.5 leading-relaxed whitespace-pre-line">
                {request.body}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
          >
            {request.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => { request.onConfirm(); onCancel(); }}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold text-white transition ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0066CC] hover:bg-[#0055B3]'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </MotionDiv>
    </MotionDiv>
  );
}

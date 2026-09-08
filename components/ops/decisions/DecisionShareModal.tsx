import React from 'react';
import { motion } from 'framer-motion';
import { Share2, X, Copy, Check } from 'lucide-react';

interface Props {
  /** Only for the heading — the caller has already formatted everything else. */
  roomName: string;
  messageText: string;
  copied: boolean;
  clientPhone?: string;
  onCopyText: () => void;
  onClose: () => void;
}

const MotionDiv = motion.div as any;

/**
 * The WhatsApp dispatch sheet for one decision.
 *
 * Behaviour is the same as when this lived inline in the Decisions screen. Two
 * things were repaired on the way out: the backdrop is a motion element now, so
 * it fades with the panel instead of vanishing on the frame the panel starts
 * its exit; and its class list carried `border-white/20/40`, which is not a
 * Tailwind class and so was drawing a default border rather than nothing.
 */
export default function DecisionShareModal({
  roomName,
  messageText,
  copied,
  clientPhone,
  onCopyText,
  onClose,
}: Props) {
  /*
    Long enough for the tick to register that the copy happened, short enough
    that the studio is looking at the decisions list by the time they come back
    from pasting it.
  */
  const runThenClose = (fn: () => void) => {
    try { fn(); } finally { setTimeout(onClose, 700); }
  };

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <MotionDiv
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-white/20 rounded-lg">
              <Share2 className="w-4 h-4 text-white" />
            </span>
            <h4 className="font-extrabold text-sm sm:text-base">Send {roomName} for approval</h4>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Message, ready to send
              </span>
              <button
                onClick={() => runThenClose(onCopyText)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs font-medium text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto select-all">
              {messageText}
            </div>
          </div>

        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            Close
          </button>
          <a
            href={`https://wa.me/${clientPhone || ''}?text=${encodeURIComponent(messageText)}`}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5"
          >
            Open WhatsApp
          </a>
        </div>
      </MotionDiv>
    </MotionDiv>
  );
}

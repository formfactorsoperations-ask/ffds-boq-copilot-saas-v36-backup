import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Smartphone, Monitor, Mail, Check, AlertCircle, Edit3, MessageSquare } from 'lucide-react';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (subject: string, html: string) => Promise<void>;
  initialSubject: string;
  initialIntro: string;
  generatePreview: (intro: string, subject: string) => { subject: string; html: string };
  recipientEmail: string;
  clientName: string;
  isSending: boolean;
  sendingStatus: 'idle' | 'sending' | 'sent' | 'error';
  error: string | null;
}

export function EmailPreviewModal({
  isOpen,
  onClose,
  onSend,
  initialSubject,
  initialIntro,
  generatePreview,
  recipientEmail,
  clientName,
  isSending,
  sendingStatus,
  error
}: EmailPreviewModalProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [subject, setSubject] = useState(initialSubject);
  const [intro, setIntro] = useState(initialIntro);

  if (!isOpen) return null;

  // Dynamically compile the HTML template with the current edit states
  const { html: liveHtml } = generatePreview(intro, subject);

  const handleSendClick = () => {
    onSend(subject, liveHtml);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col border border-slate-200"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <Mail className="w-5 h-5 text-amber-500" />
                  <span>Interactive Email Dispatch Hub</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">Customize copy and verify responsive layouts before dispatching to client</p>
              </div>
              <button 
                onClick={onClose} 
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                disabled={isSending}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Content Split: Interactive Editors & Frame Preview */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50/30">
              {/* Left Panel: Envelope Fields & Live Editors */}
              <div className="w-full md:w-96 border-b md:border-b-0 md:border-r border-slate-100 p-5 space-y-4 bg-white flex flex-col justify-between overflow-y-auto shrink-0">
                <div className="space-y-4">
                  {/* Recipient Details */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">To (Client)</span>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div className="font-bold text-slate-900 text-xs truncate">{clientName}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{recipientEmail || 'No email specified'}</div>
                    </div>
                  </div>

                  {/* Subject Line Editor */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-amber-500" />
                      <span>Subject Line</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter custom email subject..."
                      disabled={isSending}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-amber-400 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none transition-all"
                    />
                  </div>

                  {/* Intro/Body Paragraph Editor */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                      <span>Intro Note / Custom Message</span>
                    </label>
                    <textarea
                      value={intro}
                      onChange={(e) => setIntro(e.target.value)}
                      placeholder="Type a custom intro paragraph..."
                      disabled={isSending}
                      rows={6}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-100 focus:border-amber-400 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-700 leading-relaxed outline-none resize-none transition-all"
                    />
                    <span className="text-[9px] text-slate-400 block mt-1 leading-normal font-medium">
                      💡 Type in the editor above to update the email intro copy inside the preview in real-time.
                    </span>
                  </div>

                  {/* Viewport Selectors */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Responsive Viewport</span>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                      <button
                        onClick={() => setViewMode('desktop')}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'desktop'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Monitor className="w-4 h-4" />
                        <span>Desktop</span>
                      </button>
                      <button
                        onClick={() => setViewMode('mobile')}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'mobile'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Smartphone className="w-4 h-4" />
                        <span>Mobile</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer instructions/warnings */}
                <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-400 leading-relaxed font-medium">
                  🎨 The generated layout automatically incorporates the studio's theme accents, elegant typography, and includes the unique client portal token for easy sign-off.
                </div>
              </div>

              {/* Right Panel: Rendered HTML Email Preview */}
              <div className="flex-1 p-6 overflow-auto flex items-center justify-center">
                {viewMode === 'desktop' ? (
                  <div className="w-full h-full bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                      <span className="text-[11px] text-slate-400 font-semibold ml-2">Live Inbox Preview (Desktop)</span>
                    </div>
                    <iframe
                      title="Email Desktop Preview"
                      srcDoc={liveHtml}
                      className="w-full flex-1 border-none bg-slate-50"
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                    />
                  </div>
                ) : (
                  <div className="w-[360px] h-[600px] bg-[#0066CC]/90 backdrop-blur-md border border-white/20 p-3 rounded-[40px] shadow-2xl border-4 border-slate-800 relative flex flex-col shrink-0">
                    {/* Phone speaker/camera details */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 rounded-b-2xl z-10 flex items-center justify-center">
                      <div className="w-12 h-1 bg-slate-800 rounded-full mb-1"></div>
                    </div>
                    
                    {/* Screen wrapper */}
                    <div className="w-full h-full bg-white rounded-[32px] overflow-hidden flex flex-col border border-sky-900/10">
                      <div className="bg-slate-100 border-b border-slate-200/50 pt-6 px-4 pb-2 text-center text-[10px] font-black text-slate-400 tracking-wider">
                        Live Mobile Preview
                      </div>
                      <iframe
                        title="Email Mobile Preview"
                        srcDoc={liveHtml}
                        className="w-full flex-1 border-none bg-slate-50"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {/* Delivery Status Messages */}
              <div className="flex-1 mr-4">
                {sendingStatus === 'sending' && (
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                    <span className="w-3.5 h-3.5 border-2 border-sky-900 border-t-amber-400 rounded-full animate-spin"></span>
                    <span>Transmitting secure link to client's inbox...</span>
                  </div>
                )}

                {sendingStatus === 'sent' && (
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Dispatched successfully to {recipientEmail}</span>
                  </div>
                )}

                {sendingStatus === 'error' && (
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="truncate max-w-[400px]">{error || 'Failed to dispatch email.'}</span>
                  </div>
                )}
              </div>

              {/* Control Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  disabled={isSending}
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Close
                </button>

                {sendingStatus !== 'sent' && (
                  <button
                    onClick={handleSendClick}
                    disabled={isSending || !recipientEmail}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2 ${
                      recipientEmail && !isSending
                        ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white hover:bg-[#0055B3]'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5 text-amber-400" />
                    <span>{sendingStatus === 'error' ? 'Retry Sending' : 'Send Email'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

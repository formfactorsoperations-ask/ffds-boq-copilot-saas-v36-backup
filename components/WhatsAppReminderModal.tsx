import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { renderPaymentReminderMessage, buildWhatsAppURL } from '../lib/whatsappUtils';
import { X, Send } from 'lucide-react';

interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string, phone: string) => void;
  template: string;
  variables: Record<string, any>;
  clientPhone: string;
}

export function WhatsAppReminderModal({ isOpen, onClose, onSend, template, variables, clientPhone: initialPhone }: WhatsAppReminderModalProps) {
  const [phone, setPhone] = useState(initialPhone || '');

  if (!isOpen) return null;

  const defaultTemplate = "Hi {clientName}, this is a gentle reminder that payment for {milestone} ({amount}) is due for your {projectName} project. Please let us know once processed. Thank you! — {studioName}";
  const message = renderPaymentReminderMessage(template || defaultTemplate, variables);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Payment Reminder Preview</h3>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 flex flex-col pt-4 pb-0 flex-1">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Send to</label>
               <input 
                  type="text" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Client phone number (e.g. 9876543210)"
                  className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 mb-4"
               />

               <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Message Preview</label>
               <div className="bg-[#E7F6D5] p-3.5 rounded-2xl rounded-tl-none text-sm text-slate-800 shadow-sm border border-[#D1ECA6] whitespace-pre-wrap leading-relaxed relative self-start">
                   {message}
               </div>
            </div>

            <div className="p-5 flex justify-end gap-3 rounded-b-2xl bg-white mt-4">
              <button 
                onClick={onClose}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={() => onSend(message, phone)}
                disabled={!phone}
                className="px-4 py-2 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Send via WhatsApp
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

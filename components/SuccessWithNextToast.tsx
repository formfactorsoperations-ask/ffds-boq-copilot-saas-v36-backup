import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SuccessToastData {
    message: string;
}

export default function SuccessWithNextToast({ projectId, projectContext }: { projectId?: string, projectContext?: any }) {
    const [toast, setToast] = useState<SuccessToastData | null>(null);

    useEffect(() => {
        let timer: NodeJS.Timeout;

        const handleShow = (e: any) => {
            setToast(e.detail);
            // Clear any existing timer when a new toast is shown
            if (timer) clearTimeout(timer);
            // Auto-dismiss after 4 seconds
            timer = setTimeout(() => {
                setToast(null);
            }, 4000);
        };
        const handleHide = () => setToast(null);

        window.addEventListener('show-success-next', handleShow);
        window.addEventListener('hide-success-next', handleHide);

        return () => {
            window.removeEventListener('show-success-next', handleShow);
            window.removeEventListener('hide-success-next', handleHide);
            if (timer) clearTimeout(timer);
        };
    }, []);

    if (!toast) return null;

    return (
        <div className="fixed top-6 right-6 z-[100] max-w-sm w-full px-4 sm:px-0">
            <AnimatePresence>
                <motion.div 
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10, transition: { duration: 0.15 } }}
                    className="bg-[#FCFBF9] rounded-xl shadow-xl border border-[#EAE6DF] overflow-hidden flex items-start p-4 gap-3 relative"
                >
                    {/* Tiny gold top hairline as single brand accent */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/80" />

                    <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    
                    <div className="flex-grow pr-4">
                        <p className="text-slate-900 font-medium text-sm leading-relaxed">{toast.message}</p>
                    </div>

                    <button 
                        onClick={() => setToast(null)} 
                        className="text-slate-400 hover:text-slate-900 transition-colors shrink-0 p-0.5 rounded-md hover:bg-slate-100 mt-0.5"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

export const showSuccessWithNext = (message: string, overrideNextAction?: { label: string; tab?: string; onClick?: () => void }) => {
    window.dispatchEvent(new CustomEvent('show-success-next', { detail: { message } }));
};

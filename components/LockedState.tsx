import React from 'react';
import { Lock, ArrowRight, Play, CheckCircle2 } from 'lucide-react';

interface LockedStateProps {
    title?: string;
    prerequisite?: string;
    why?: string;
    actionLabel?: string;
    onAction?: () => void;
    isEmptyState?: boolean;
}

export default function LockedState({
    title = "Module Locked",
    prerequisite = "Prerequisite Required",
    why = "Please complete the preceding steps to unlock this module.",
    actionLabel = "Go to Prerequisite",
    onAction,
    isEmptyState = false
}: LockedStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center h-full min-h-[50vh] bg-slate-50/50 rounded-2xl border border-slate-100">
            <div className={`w-16 h-16 rounded-full mb-6 flex items-center justify-center shadow-sm ${isEmptyState ? 'bg-sky-100 text-[#3D52A0]' : 'bg-slate-100 text-slate-400'}`}>
                {isEmptyState ? <CheckCircle2 className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
            </div>
            
            <h2 className="text-xl md:text-2xl font-semibold text-slate-800 mb-2 tracking-tight">
                {title}
            </h2>
            
            {!isEmptyState && prerequisite && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
                    <Lock className="w-3 h-3" />
                    Available after: {prerequisite}
                </div>
            )}
            
            <p className="text-slate-500 max-w-md mx-auto mb-8 leading-relaxed">
                {why}
            </p>
            
            {onAction && (
                <button
                    onClick={onAction}
                    className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-sm transition-all ${isEmptyState ? 'bg-[#3D52A0] text-white hover:bg-[#334486]' : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                    {isEmptyState ? <Play className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    {actionLabel}
                </button>
            )}
        </div>
    );
}

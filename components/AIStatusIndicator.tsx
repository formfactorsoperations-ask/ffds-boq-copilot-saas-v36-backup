import React from 'react';
import { AIStatus } from '../types';

interface AIStatusIndicatorProps {
    status: AIStatus;
}

const AIStatusIndicator: React.FC<AIStatusIndicatorProps> = ({ status }) => {
    const statusConfig = {
        checking: { color: 'bg-yellow-400', text: 'Verifying AI Connection...' },
        online: { color: 'bg-green-500', text: 'AI Services Online' },
        error: { color: 'bg-red-500', text: 'AI Error: Check API Key' },
        unavailable: { color: 'bg-slate-400', text: 'AI Unavailable: No API Key' },
    };

    const { color, text } = statusConfig[status];

    return (
        <div className="relative group flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/50 border border-slate-200/80 rounded-lg">
                <span className={`w-2.5 h-2.5 rounded-full ${color} ${status === 'checking' ? 'animate-pulse' : ''}`}></span>
                <span className="text-xs font-bold text-slate-600">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </div>
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 bg-indigo-950/80 backdrop-blur-sm text-white text-xs font-bold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-xl">
                {text}
                <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-indigo-950/80 rotate-45"></div>
            </div>
        </div>
    );
};

export default AIStatusIndicator;
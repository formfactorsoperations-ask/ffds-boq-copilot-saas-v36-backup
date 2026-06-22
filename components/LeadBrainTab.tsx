
import React, { useState } from 'react';
import { ProjectContext, LeadProfile, DecisionBrainOutput } from '../types';
import Card from './shared/Card';
import { SparklesIcon, BrainIcon } from './Icons';
import { analyzeLeadStrategy, isAiAvailable } from '../services/geminiService';
import { motion } from 'framer-motion';

interface LeadBrainTabProps {
    projectContext: ProjectContext;
    leadProfile: LeadProfile;
    setLeadProfile: (profile: LeadProfile) => void;
    onStrategyChange?: (strategy: DecisionBrainOutput | null) => void;
    setActiveTab?: (tab: string) => void;
}

const BEHAVIOR_TAGS = [
    "Price Conscious", "Quality First", "Urgent Timeline", "Has Contractor", 
    "Pinterest Heavy", "Technical Queries", "Vague Requirements", "Decision Maker"
];

const LeadBrainTab: React.FC<LeadBrainTabProps> = ({ projectContext, leadProfile, setLeadProfile, onStrategyChange, setActiveTab }) => {
    const [strategy, setStrategy] = useState<DecisionBrainOutput | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!isAiAvailable()) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await analyzeLeadStrategy(projectContext, leadProfile);
            setStrategy(result);
            if (onStrategyChange) {
                onStrategyChange(result);
            }
        } catch (e: any) {
            console.error("Strategy generation failed:", e);
            setError(e.message || "Failed to generate strategy. Please try again.");
            setStrategy(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (field: keyof LeadProfile, value: any) => {
        setLeadProfile({ ...leadProfile, [field]: value });
    };

    const handleDraftProposal = () => {
        if (setActiveTab) {
            setActiveTab('client');
        }
    };

    const getScoreColor = (score: number, type: 'risk' | 'fit') => {
        if (type === 'risk') return score > 60 ? 'bg-red-500' : score > 30 ? 'bg-amber-500' : 'bg-emerald-500';
        return score > 70 ? 'bg-emerald-500' : score > 40 ? 'bg-amber-500' : 'bg-red-500';
    };

    const MotionDiv = motion.div as any;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input Column - The Profiler */}
            <div className="lg:col-span-4 space-y-6">
                <Card title="LeadIQ Profiler" titleIcon={<BrainIcon className="w-4 h-4"/>}>
                    <div className="space-y-5">
                         <div className="p-3 bg-slate-50 border rounded-xl">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Project Brief</label>
                            <textarea 
                                value={leadProfile.projectBrief || ''}
                                onChange={(e) => handleInputChange('projectBrief', e.target.value)}
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm h-20 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                                placeholder='Client notes, requirements, or raw thoughts...'
                            />
                        </div>

                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Budget (₹)</label>
                                <input 
                                    type="number"
                                    value={leadProfile.budgetValue || ''}
                                    onChange={(e) => handleInputChange('budgetValue', Number(e.target.value))}
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm font-semibold"
                                    placeholder="25,00,000"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
                                <select 
                                    value={leadProfile.budgetDisclosed ? 'yes' : 'no'}
                                    onChange={(e) => handleInputChange('budgetDisclosed', e.target.value === 'yes')}
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                >
                                    <option value="yes">Disclosed</option>
                                    <option value="no">Unknown</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Responsiveness</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['high', 'medium', 'low'].map(r => (
                                    <div 
                                    key={r} 
                                    onClick={() => handleInputChange('responsiveness', r)}
                                    className={`cursor-pointer p-2 rounded-lg border text-center transition-all ${leadProfile.responsiveness === r ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        <div className="text-xl mb-1">{r === 'high' ? '⚡' : r === 'medium' ? '💬' : '👻'}</div>
                                        <span className="text-[10px] uppercase">{r}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Behavioural Signals</label>
                            <div className="flex flex-wrap gap-2">
                                {BEHAVIOR_TAGS.map(tag => {
                                    const isActive = leadProfile.behaviouralNotes.includes(tag);
                                    return (
                                        <button
                                        key={tag}
                                        onClick={() => {
                                            const newNotes = isActive 
                                                ? (leadProfile.behaviouralNotes || '').replace(tag, '').replace(', ,', ',').trim()
                                                : (leadProfile.behaviouralNotes ? leadProfile.behaviouralNotes + ', ' + tag : tag);
                                            handleInputChange('behaviouralNotes', newNotes);
                                        }}
                                        className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all border ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {tag}
                                        </button>
                                    )
                                })}
                            </div>
                            <textarea 
                                value={leadProfile.behaviouralNotes}
                                onChange={(e) => handleInputChange('behaviouralNotes', e.target.value)}
                                className="w-full mt-3 p-2 text-sm border border-slate-200 rounded-lg h-16 resize-none focus:outline-none focus:border-blue-300"
                                placeholder="Add custom notes..."
                            />
                        </div>

                        <div className="p-4 bg-blue-950 rounded-xl text-white shadow-lg">
                             <label className="block text-xs font-bold text-blue-200 uppercase mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                LeadLens Calibration
                             </label>
                             <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-blue-200">Ghosting Probability</span>
                                        <span className={`font-bold ${leadProfile.leadLensGhostingScore > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{leadProfile.leadLensGhostingScore}%</span>
                                    </div>
                                    <div className="relative w-full h-2 bg-blue-900 rounded-full overflow-hidden">
                                        <div className={`absolute top-0 left-0 h-full rounded-full ${getScoreColor(leadProfile.leadLensGhostingScore, 'risk')}`} style={{width: `${leadProfile.leadLensGhostingScore}%`}}></div>
                                    </div>
                                    <input 
                                        type="range" min="0" max="100" 
                                        value={leadProfile.leadLensGhostingScore}
                                        onChange={(e) => handleInputChange('leadLensGhostingScore', parseInt(e.target.value))}
                                        className="w-full h-4 opacity-0 absolute top-0 left-0 cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-blue-200">Ideal Client Fit</span>
                                        <span className={`font-bold ${leadProfile.leadLensFitScore > 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{leadProfile.leadLensFitScore}%</span>
                                    </div>
                                    <div className="relative w-full h-2 bg-blue-900 rounded-full overflow-hidden">
                                        <div className={`absolute top-0 left-0 h-full rounded-full ${getScoreColor(leadProfile.leadLensFitScore, 'fit')}`} style={{width: `${leadProfile.leadLensFitScore}%`}}></div>
                                    </div>
                                    <input 
                                        type="range" min="0" max="100" 
                                        value={leadProfile.leadLensFitScore}
                                        onChange={(e) => handleInputChange('leadLensFitScore', parseInt(e.target.value))}
                                        className="w-full h-4 opacity-0 absolute top-0 left-0 cursor-pointer"
                                    />
                                </div>
                             </div>
                        </div>

                        <button 
                            onClick={handleAnalyze} 
                            disabled={isLoading || !isAiAvailable()}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Running Simulation...</span>
                                </>
                            ) : (
                                <><BrainIcon className="w-5 h-5" /> Generate Strategy</>
                            )}
                        </button>
                    </div>
                </Card>
            </div>

            {/* Output Column - The War Room */}
            <div className="lg:col-span-8">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center text-blue-400 border-2 border-dashed border-blue-200 rounded-3xl bg-blue-50/30">
                        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                        <h3 className="text-xl font-bold mb-2">Simulating Scenarios...</h3>
                        <p className="max-w-md text-blue-500/70">Analyzing requirements and calculating optimal margin and risk exposure.</p>
                    </div>
                ) : error ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center text-red-500 border-2 border-dashed border-red-200 rounded-3xl bg-red-50">
                        <h3 className="text-2xl font-bold mb-2 text-red-700">Analysis Failed</h3>
                        <p className="max-w-md text-red-500 mb-6">{error}</p>
                        <button onClick={handleAnalyze} className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl shadow hover:bg-red-700 hover:scale-105 transition-all">Retry Analysis</button>
                    </div>
                ) : strategy ? (
                    <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                        
                        {/* Strategy Header */}
                        <div className={`p-8 rounded-3xl border-l-[12px] shadow-xl flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden bg-white
                            ${strategy.recommended_proposal_depth === 'LEAN_SNAPSHOT' ? 'border-orange-500' : 
                              strategy.recommended_proposal_depth === 'STANDARD' ? 'border-blue-500' : 'border-emerald-500'}
                        `}>
                            {/* Background Pattern */}
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>

                            <div className="relative z-10 flex-grow">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-blue-900 text-white px-2 py-1 rounded">Strategy Active</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">FFDS Decision Brain</span>
                                </div>
                                <h2 className="text-4xl font-black tracking-tight text-blue-900">{(strategy.recommended_proposal_depth || '').replace(/_/g, ' ')}</h2>
                                <p className="text-base mt-3 text-slate-600 font-medium max-w-xl leading-relaxed">
                                    {strategy.recommended_proposal_depth === 'LEAN_SNAPSHOT' && "⚠️ High Risk Protocol: Provide a visual mood board and a ballpark total only. Do NOT share a detailed BOQ."}
                                    {strategy.recommended_proposal_depth === 'STANDARD' && "ℹ️ Standard Protocol: Provide structured scope and category-wise costs. Keep specific line-item rates internal."}
                                    {strategy.recommended_proposal_depth === 'DETAILED' && "✅ Trust Established: Full transparency authorized. Provide item-wise BOQ and detailed specifications."}
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 relative z-10 shrink-0">
                                <button 
                                    onClick={handleDraftProposal}
                                    className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl hover:bg-blue-700 hover:scale-105 transition-all flex items-center justify-center gap-3 group"
                                >
                                    <span>Execute Proposal</span>
                                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                                </button>
                            </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Designer Avoidance Index</p>
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${strategy.designer_avoidance_index > 60 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                            {strategy.designer_avoidance_index > 60 ? 'High Risk' : 'Safe'}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-5xl font-black text-slate-800">{strategy.designer_avoidance_index}</p>
                                        <span className="text-sm font-bold text-slate-300">/ 100</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1.5 mt-4 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-800" style={{width: `${strategy.designer_avoidance_index}%`}}></div>
                                    </div>
                                </div>
                             </div>

                             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Commitment Score</p>
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${strategy.commitment_score < 40 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {strategy.commitment_score < 40 ? 'Weak' : 'Strong'}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-5xl font-black text-slate-800">{strategy.commitment_score}</p>
                                        <span className="text-sm font-bold text-slate-300">/ 100</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1.5 mt-4 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-600" style={{width: `${strategy.commitment_score}%`}}></div>
                                    </div>
                                </div>
                             </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            {/* Detailed Tactics */}
                            <div className="md:col-span-7 space-y-6">
                                <Card title="Tactical Directives">
                                    <div className="space-y-5">
                                         <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Proposal Tiers</span>
                                            <span className="font-bold text-slate-800 text-sm">{(strategy.recommended_tiers || []).join(' → ')}</span>
                                         </div>
                                         <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Margin Approach</span>
                                            <span className="font-bold text-slate-800 text-sm capitalize px-2 py-1 bg-slate-100 rounded">{strategy.margin_strategy}</span>
                                         </div>
                                         <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Messaging Tone</span>
                                            <span className="font-bold text-slate-800 text-sm capitalize">{(strategy.proposal_tone || '').replace(/_/g, ' ')}</span>
                                         </div>
                                         <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Follow-up</span>
                                            <span className="font-bold text-slate-800 text-sm capitalize">{(strategy.followup_style || '').replace(/_/g, ' ')}</span>
                                         </div>
                                    </div>
                                </Card>

                                <Card title="Scope Bias Configuration">
                                    <div className="grid grid-cols-2 gap-3">
                                        {Object.entries(strategy.scope_bias || {}).map(([key, val]) => (
                                            <div key={key} className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${val ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                                <span className={`w-2.5 h-2.5 rounded-full ${val ? 'bg-blue-500' : 'bg-slate-300'}`}></span>
                                                {(key || '').replace(/_/g, ' ').toUpperCase()}
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </div>
                            
                            {/* Rationale & Risks */}
                            <div className="md:col-span-5 space-y-6">
                                <Card title="Intelligence Brief" className="h-full bg-slate-50 border-slate-200">
                                   <ul className="space-y-3">
                                       {(strategy.rationale_summary || []).map((r, i) => (
                                            <li key={i} className="flex gap-3 text-sm text-slate-600 leading-snug">
                                                <span className="text-blue-500 mt-0.5">•</span>
                                                {r}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-6 pt-6 border-t border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Threat Detection</p>
                                        <div className="space-y-2">
                                            <div className={`p-2 rounded-lg border text-xs font-bold flex justify-between ${strategy.flags?.discovery_required_before_proposal ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                <span>Insufficient Info</span>
                                                {strategy.flags?.discovery_required_before_proposal && <span>⚠️ DETECTED</span>}
                                            </div>
                                            <div className={`p-2 rounded-lg border text-xs font-bold flex justify-between ${strategy.flags?.proposal_should_wait_due_to_silence ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                <span>Timing / Silence Risk</span>
                                                {strategy.flags?.proposal_should_wait_due_to_silence && <span>⚠️ DETECTED</span>}
                                            </div>
                                        </div>
                                    </div>
                                 </Card>
                            </div>
                        </div>

                    </MotionDiv>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/30">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                            <BrainIcon className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-600 mb-2">Strategy Awaiting Input</h3>
                        <p className="max-w-md text-slate-500">Configure the lead profile on the left and initialize the Decision Brain to generate a tailored engagement strategy.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadBrainTab;

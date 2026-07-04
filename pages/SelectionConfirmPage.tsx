import React, { useState, useEffect } from 'react';
import { MaterialSelection } from '../types';

interface SelectionConfirmPageProps {
    token: string;
}

export default function SelectionConfirmPage({ token }: SelectionConfirmPageProps) {
    const [selection, setSelection] = useState<MaterialSelection | null>(null);
    const [project, setProject] = useState<any>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    
    const [showChangeRequest, setShowChangeRequest] = useState(false);
    const [changeReason, setChangeReason] = useState("");
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'confirmed'>('idle');

    useEffect(() => {
        // Mocking the collectionGroup query using the local mock data
        let foundSel: MaterialSelection | null = null;
        let foundProj: any = null;
        
        // Check localStorage for demo purposes
        try {
            const storedProject = localStorage.getItem('ffds_project_mock');
            if (storedProject) {
                const parsed = JSON.parse(storedProject);
                const s = (parsed.materialSelections || []).find((x: any) => x.confirmationToken === token);
                if (s) {
                    foundSel = s;
                    foundProj = parsed;
                }
            }
        } catch (e) {}
        
        setTimeout(() => {
            if (foundSel && foundProj) {
                setSelection(foundSel);
                setProject(foundProj);
            } else {
                // Mock one for the sake of the demo UI working standalone directly from url
                setSelection({
                    id: 'mock-1',
                    itemName: 'Sample Material',
                    roomId: 'Living Room',
                    category: 'Laminate',
                    finishCode: 'L-100',
                    brand: 'Marino',
                    vendor: 'Sample Vendor',
                    status: 'sent_for_approval',
                    leadTimeDays: 7,
                    confirmationToken: token,
                    photos: ['https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=500&q=80']
                });
                setProject({
                    orgName: 'Form Factors',
                    name: 'Demo Project'
                });
            }
            setIsLoaded(true);
        }, 500);
    }, [token]);

    const handleConfirm = () => {
        // Real implementation would update Firestore
        setSubmitStatus('confirmed');
    };

    const handleChangeRequest = () => {
        if (!changeReason) return;
        // Real implementation would update Firestore & notify designer
        setSubmitStatus('success');
    };

    if (!isLoaded) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!selection) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="text-center text-slate-500 font-bold text-lg">Selection not found or link has expired.</div>
            </div>
        );
    }

    const { itemName, brand, finishCode, vendor, quotedPrice, priceUnit, photos, notes } = selection;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 py-4 px-6 shadow-sm sticky top-0 z-10">
                <div className="max-w-2xl mx-auto flex items-center gap-3">
                    {project?.logoImage ? (
                        <img src={project.logoImage} alt="Logo" className="h-8" />
                    ) : (
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black">
                            {project?.orgName ? project.orgName.charAt(0) : 'F'}
                        </div>
                    )}
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{project?.orgName || 'Studio'}</div>
                        <div className="text-sm font-bold text-indigo-900">{project?.name || 'Project'}</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 sm:pt-8 w-full">
                <h1 className="text-xl sm:text-2xl font-black text-indigo-950 mb-6 flex items-center gap-2">
                    Material selection confirmation
                </h1>

                {submitStatus === 'confirmed' ? (
                    <div className="bg-emerald-50 rounded-2xl p-8 text-center border border-emerald-100 shadow-sm">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                            ✓
                        </div>
                        <h2 className="text-2xl font-bold text-indigo-900 mb-2">Selection confirmed</h2>
                        <p className="text-slate-600">Your selection has been confirmed. {project?.orgName || 'The studio'} will proceed with procurement.</p>
                    </div>
                ) : submitStatus === 'success' ? (
                    <div className="bg-emerald-50 rounded-2xl p-8 text-center border border-emerald-100 shadow-sm">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                            ✓
                        </div>
                        <h2 className="text-2xl font-bold text-indigo-900 mb-2">Request sent</h2>
                        <p className="text-slate-600">Your request has been sent. {project?.orgName || 'The studio'} will review and be in touch soon.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Material Card */}
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                            {photos && photos.length > 0 && (
                                <div className="w-full h-64 sm:h-80 bg-slate-100 relative">
                                    <img src={photos[0]} alt={itemName} className="w-full h-full object-cover" />
                                </div>
                            )}
                            
                            <div className="p-6 sm:p-8 space-y-6">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 leading-tight">{itemName}</h2>
                                    {(brand || finishCode) && (
                                        <div className="text-lg text-slate-600 font-medium mt-1">
                                            {brand && <span className="font-bold">{brand}</span>}
                                            {brand && finishCode && <span className="mx-2 text-slate-300">|</span>}
                                            {finishCode && <span>{finishCode}</span>}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-6">
                                    {vendor && (
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Shop / Vendor</div>
                                            <div className="font-bold text-indigo-900 flex items-center gap-2">
                                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                                {vendor}
                                            </div>
                                        </div>
                                    )}
                                    {quotedPrice && (
                                        <div>
                                            <div className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-widest mb-1">Estimated Price</div>
                                            <div className="font-bold text-emerald-700 text-lg">
                                                ₹{quotedPrice.toLocaleString('en-IN')} <span className="text-sm text-emerald-600/60 font-medium">/{priceUnit?.replace('per_', '') || 'unit'}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {notes && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                        <div className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest mb-1">Designer Notes</div>
                                        <p className="text-amber-900 text-sm font-medium whitespace-pre-wrap">{notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        {showChangeRequest ? (
                            <div className="bg-white rounded-3xl border border-rose-100 p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                                <h3 className="font-bold text-indigo-900 text-lg mb-2 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Request a change
                                </h3>
                                <p className="text-sm text-slate-500 mb-4 font-medium">Let us know what you want to change, and we'll look for alternatives.</p>
                                
                                <textarea
                                    value={changeReason}
                                    onChange={(e) => setChangeReason(e.target.value)}
                                    placeholder="What would you like to change?"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none resize-none font-medium mb-4"
                                    rows={3}
                                />
                                
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => setShowChangeRequest(false)}
                                        className="flex-1 border border-slate-200 bg-white text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleChangeRequest}
                                        disabled={!changeReason.trim()}
                                        className="flex-1 bg-indigo-900 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-950 transition-colors shadow-sm disabled:opacity-50"
                                    >
                                        Send Request
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <button 
                                    onClick={handleConfirm}
                                    className="w-full bg-emerald-600 text-white font-bold py-4 px-6 rounded-2xl hover:bg-emerald-700 transition-all text-lg shadow-sm flex items-center justify-center gap-2"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    I confirm this selection
                                </button>
                                
                                <button 
                                    onClick={() => setShowChangeRequest(true)}
                                    className="w-full border-2 border-slate-200 text-slate-600 font-bold py-3.5 px-6 rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                                >
                                    I want to change this
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

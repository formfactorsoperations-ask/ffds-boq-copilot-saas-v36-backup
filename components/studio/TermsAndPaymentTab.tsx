import React, { useState, useEffect } from 'react';
import { useOrg } from '../../contexts/OrgContext';
import { getTermsSettings, setTermsSettings, getPaymentStructure, setPaymentStructure, seedEngagementDefaults, restoreFFDSDefaults, FFDS_PAYMENT_STRUCTURE_DEFAULTS, GENERIC_PAYMENT_STRUCTURE_DEFAULTS } from '../../services/engagementService';
import { TermsSettings, PaymentStructure, PaymentStructureStage } from '../../types';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';

export default function TermsAndPaymentTab() {
    const { orgData } = useOrg();
    const orgId = orgData?.tenantId || 'demo-tenant-01';
    
    const [terms, setTerms] = useState<TermsSettings | null>(null);
    const [paymentStr, setPaymentStr] = useState<PaymentStructure | null>(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                let t = await getTermsSettings(orgId);
                let p = await getPaymentStructure(orgId);
                
                if (!t || !p) {
                    await seedEngagementDefaults(orgId);
                    t = await getTermsSettings(orgId);
                    p = await getPaymentStructure(orgId);
                }

                if (t) setTerms(t);
                if (p) setPaymentStr(p);
            } catch (err) {
                console.error("Failed to load terms and payment", err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [orgId]);

    const handleSave = async () => {
        if (!terms || !paymentStr) return;
        
        try {
            setSaveStatus('saving');
            setErrorMessage('');
            
            // Re-validate just to be sure before calling setter (which also validates)
            const dSum = paymentStr.designStages.reduce((a, c) => a + c.pct, 0);
            const eSum = paymentStr.executionStages.reduce((a, c) => a + c.pct, 0);
            const reqD = paymentStr.validation?.designSumMustEqual || 100;
            const reqE = paymentStr.validation?.executionSumMustEqual || 100;
            
            if (dSum !== reqD) {
                throw new Error(`Validation Error: Design stages sum is ${dSum}%, expected ${reqD}%`);
            }
            if (eSum !== reqE) {
                throw new Error(`Validation Error: Execution stages sum is ${eSum}%, expected ${reqE}%`);
            }

            await setTermsSettings(orgId, terms);
            await setPaymentStructure(orgId, paymentStr);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err: any) {
            console.error("Save failed", err);
            setSaveStatus('error');
            setErrorMessage(err.message || 'Failed to save settings.');
        }
    };

    if (loading) return <div className="p-8 text-slate-500">Loading Terms & Payment...</div>;
    if (!terms || !paymentStr) return <div className="p-8 text-red-500">Failed to load structures. Run initialization.</div>;

    const updateTerms = (field: keyof TermsSettings, val: any) => setTerms({ ...terms, [field]: val });
    
    // --- Terms Editor Helpers ---
    const handleTermsListUpdate = (field: keyof TermsSettings, idx: number, val: string) => {
        const list = [...(terms[field] as string[])];
        list[idx] = val;
        updateTerms(field, list);
    };
    const addTermsListItem = (field: keyof TermsSettings, defaultVal = '') => {
        updateTerms(field, [...(terms[field] as string[]), defaultVal]);
    };
    const removeTermsListItem = (field: keyof TermsSettings, idx: number) => {
        const list = [...(terms[field] as string[])];
        list.splice(idx, 1);
        updateTerms(field, list);
    };

    const handleSnagUpdate = (idx: number, field: string, val: any) => {
        const list = [...terms.snagCategories];
        list[idx] = { ...list[idx], [field]: val };
        updateTerms('snagCategories', list);
    };
    
    const handleWarrantyUpdate = (idx: number, field: string, val: any) => {
        const list = [...terms.warrantyPeriods];
        list[idx] = { ...list[idx], [field]: val };
        updateTerms('warrantyPeriods', list);
    };

    // --- Payment Editor Helpers ---
    const handlePaymentStageUpdate = (type: 'designStages' | 'executionStages', idx: number, field: keyof PaymentStructureStage, val: any) => {
        const list = [...paymentStr[type]];
        list[idx] = { ...list[idx], [field]: val };
        setPaymentStr({ ...paymentStr, [type]: list });
    };
    
    const addPaymentStage = (type: 'designStages' | 'executionStages') => {
        const prefix = type === 'designStages' ? 'D' : 'E';
        const list = [...paymentStr[type]];
        const newCode = `${prefix}${list.length + 1}`;
        list.push({ code: newCode, name: '', pct: 0, trigger: '', unlocks: '' });
        setPaymentStr({ ...paymentStr, [type]: list });
    };
    const removePaymentStage = (type: 'designStages' | 'executionStages', idx: number) => {
        const list = [...paymentStr[type]];
        list.splice(idx, 1);
        setPaymentStr({ ...paymentStr, [type]: list });
    };

    const dSum = paymentStr.designStages.reduce((a, c) => a + c.pct, 0);
    const eSum = paymentStr.executionStages.reduce((a, c) => a + c.pct, 0);
    const reqD = paymentStr.validation?.designSumMustEqual || 100;
    const reqE = paymentStr.validation?.executionSumMustEqual || 100;
    const dValid = dSum === reqD;
    const eValid = eSum === reqE;

    return (
        <div className="space-y-8 pb-16">
            
            {/* --- TERMS EDITOR --- */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-[#1e3a8a] text-lg">Terms Editor</h3>
                    <p className="text-sm text-slate-500 mt-1">Configure studio identity, frameworks, and contract clauses.</p>
                </div>
                <div className="p-8 space-y-8 font-['Plus_Jakarta_Sans']">
                    
                    {/* Studio Identity */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-4">Studio Identity</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Docket Ref Prefix</label>
                                <input type="text" value={terms.docketRefPrefix} onChange={e => updateTerms('docketRefPrefix', e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Studio Founded Year</label>
                                <input type="number" value={terms.studioFoundedYear} onChange={e => updateTerms('studioFoundedYear', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" />
                            </div>
                        </div>
                    </div>

                    {/* Framework Numbers */}
                    <div className="pt-6 border-t border-slate-100">
                        <h4 className="font-bold text-slate-700 mb-4">Framework Parameters</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Included Revision Rounds</label><input type="number" value={terms.includedRevisionRounds} onChange={e => updateTerms('includedRevisionRounds', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Change Request Response (Days)</label><input type="number" value={terms.changeRequestResponseDays} onChange={e => updateTerms('changeRequestResponseDays', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Payment Overdue Grace (Days)</label><input type="number" value={terms.paymentOverdueGraceDays} onChange={e => updateTerms('paymentOverdueGraceDays', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Resume After Payment (Days)</label><input type="number" value={terms.resumeAfterPaymentDays} onChange={e => updateTerms('resumeAfterPaymentDays', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">GST Rate (%)</label><input type="number" value={terms.gstRate} onChange={e => updateTerms('gstRate', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Dispute Mediation (Days)</label><input type="number" value={terms.disputeMediationDays} onChange={e => updateTerms('disputeMediationDays', Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                            <div className="md:col-span-3"><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Dispute Jurisdiction</label><input type="text" value={terms.disputeJurisdiction} onChange={e => updateTerms('disputeJurisdiction', e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a]" /></div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Payment Methods</label>
                            <div className="flex gap-2 flex-wrap">
                                {terms.paymentMethods.map((pm, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
                                        <input type="text" value={pm} onChange={e => handleTermsListUpdate('paymentMethods', idx, e.target.value)} className="bg-transparent outline-none text-sm w-24" />
                                        <button onClick={() => removeTermsListItem('paymentMethods', idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addTermsListItem('paymentMethods')} className="flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-[#1e3a8a] hover:border-[#1e3a8a]"><Plus className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </div>

                    {/* Design Process Phases */}

                    {/* Snag Categories */}
                    <div className="pt-6 border-t border-slate-100">
                        <h4 className="font-bold text-slate-700 mb-4">Snag Categories</h4>
                        <div className="space-y-2">
                            {terms.snagCategories.map((snag, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <input type="text" placeholder="Category Label" value={snag.label} onChange={e => handleSnagUpdate(idx, 'label', e.target.value)} className="w-1/3 px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                    <input type="number" placeholder="Resolve Days" value={snag.resolveDays} onChange={e => handleSnagUpdate(idx, 'resolveDays', Number(e.target.value))} className="w-32 px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                    <button onClick={() => { const l = [...terms.snagCategories]; l.splice(idx,1); updateTerms('snagCategories', l); }} className="text-red-400 hover:text-red-600 p-2"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                            <button onClick={() => updateTerms('snagCategories', [...terms.snagCategories, {label:'', resolveDays: 0}])} className="mt-2 flex items-center gap-2 text-sm text-[#1e3a8a] font-bold px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100"><Plus className="w-4 h-4" /> Add Category</button>
                        </div>
                    </div>

                    {/* Warranty Periods */}
                    <div className="pt-6 border-t border-slate-100">
                        <h4 className="font-bold text-slate-700 mb-4">Warranty Periods</h4>
                        <div className="space-y-2">
                            {terms.warrantyPeriods.map((wp, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <input type="text" placeholder="Trade" value={wp.trade} onChange={e => handleWarrantyUpdate(idx, 'trade', e.target.value)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                    <input type="number" placeholder="Months" value={wp.months} onChange={e => handleWarrantyUpdate(idx, 'months', Number(e.target.value))} className="w-32 px-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                    <button onClick={() => { const l = [...terms.warrantyPeriods]; l.splice(idx,1); updateTerms('warrantyPeriods', l); }} className="text-red-400 hover:text-red-600 p-2"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                            <button onClick={() => updateTerms('warrantyPeriods', [...terms.warrantyPeriods, {trade:'', months: 0}])} className="mt-2 flex items-center gap-2 text-sm text-[#1e3a8a] font-bold px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100"><Plus className="w-4 h-4" /> Add Warranty</button>
                        </div>
                    </div>

                    {/* Preamble */}
                    <div className="pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase">Preamble</label>
                            <span className="text-[10px] text-slate-400 italic">Rendered verbatim - not rewritten by AI</span>
                        </div>
                        <textarea value={terms.preamble || ''} onChange={e => updateTerms('preamble', e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-[#1e3a8a] h-24 resize-y text-sm" />
                    </div>

                    {/* Sections & Blocks Editor */}
                    <div className="pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-slate-700">Document Sections</h4>
                            <button onClick={() => {
                                const newSections = [...(terms.sections || [])];
                                newSections.push({ n: newSections.length + 1, title: 'New Section', blocks: [] });
                                updateTerms('sections', newSections);
                            }} className="flex items-center gap-2 text-sm text-[#1e3a8a] font-bold px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100">
                                <Plus className="w-4 h-4" /> Add Section
                            </button>
                        </div>
                        
                        <div className="space-y-8">
                            {(terms.sections || []).map((sec, sIdx) => (
                                <div key={sIdx} className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                                    <div className="bg-white p-4 border-b border-slate-200 flex flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <input type="number" value={sec.n} onChange={e => {
                                                const list = [...terms.sections];
                                                list[sIdx] = { ...list[sIdx], n: Number(e.target.value) };
                                                updateTerms('sections', list);
                                            }} className="w-16 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-bold text-center" />
                                            <input type="text" value={sec.title} onChange={e => {
                                                const list = [...terms.sections];
                                                list[sIdx] = { ...list[sIdx], title: e.target.value };
                                                updateTerms('sections', list);
                                            }} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] font-bold" />
                                            
                                            <label className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100">
                                                <input type="checkbox" checked={!!sec.recommended} onChange={e => {
                                                    const list = [...terms.sections];
                                                    list[sIdx] = { ...list[sIdx], recommended: e.target.checked };
                                                    updateTerms('sections', list);
                                                }} />
                                                Recommended addition
                                            </label>

                                            <button onClick={() => {
                                                const list = [...terms.sections];
                                                list.splice(sIdx, 1);
                                                updateTerms('sections', list);
                                            }} className="text-red-400 hover:text-red-600 p-2 border border-slate-200 rounded-lg bg-white ml-2"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 space-y-4">
                                        {sec.blocks.map((block, bIdx) => (
                                            <div key={bIdx} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 relative">
                                                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                                                    <span className="text-xs font-bold uppercase text-[#1e3a8a] bg-indigo-50 px-2 py-1 rounded">{block.type}</span>
                                                    <button onClick={() => {
                                                        const list = [...terms.sections];
                                                        list[sIdx].blocks.splice(bIdx, 1);
                                                        updateTerms('sections', list);
                                                    }} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                                </div>

                                                {block.type === 'clause' && (
                                                    <div className="flex gap-3">
                                                        <input type="text" placeholder="Ref (e.g. 1.1)" value={block.ref || ''} onChange={e => {
                                                            const list = [...terms.sections];
                                                            list[sIdx].blocks[bIdx] = { ...block, ref: e.target.value };
                                                            updateTerms('sections', list);
                                                        }} className="w-24 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-bold" />
                                                        <textarea placeholder="Clause text (rendered verbatim)" value={block.text || ''} onChange={e => {
                                                            const list = [...terms.sections];
                                                            list[sIdx].blocks[bIdx] = { ...block, text: e.target.value };
                                                            updateTerms('sections', list);
                                                        }} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm h-24 resize-y" />
                                                    </div>
                                                )}

                                                {block.type === 'callout' && (
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex gap-3">
                                                            <select value={block.style || 'principle'} onChange={e => {
                                                                const list = [...terms.sections];
                                                                list[sIdx].blocks[bIdx] = { ...block, style: e.target.value as any };
                                                                updateTerms('sections', list);
                                                            }} className="w-40 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm">
                                                                <option value="principle">Principle (Blue)</option>
                                                                <option value="highlight">Highlight (Gold)</option>
                                                            </select>
                                                            <input type="text" placeholder="Label (e.g. THE ADVANCE PAYMENT PRINCIPLE)" value={block.label || ''} onChange={e => {
                                                                const list = [...terms.sections];
                                                                list[sIdx].blocks[bIdx] = { ...block, label: e.target.value };
                                                                updateTerms('sections', list);
                                                            }} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-bold" />
                                                        </div>
                                                        <textarea placeholder="Callout text (rendered verbatim, \n\n for paragraphs)" value={block.text || ''} onChange={e => {
                                                            const list = [...terms.sections];
                                                            list[sIdx].blocks[bIdx] = { ...block, text: e.target.value };
                                                            updateTerms('sections', list);
                                                        }} className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm h-24 resize-y" />
                                                    </div>
                                                )}

                                                {block.type === 'table' && (
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex gap-3">
                                                            <select value={block.source || 'warrantyPeriods'} onChange={e => {
                                                                const list = [...terms.sections];
                                                                list[sIdx].blocks[bIdx] = { ...block, source: e.target.value as any };
                                                                updateTerms('sections', list);
                                                            }} className="w-48 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm">
                                                                <option value="warrantyPeriods">Warranty Periods</option>
                                                                <option value="snagCategories">Snag Categories</option>
                                                            </select>
                                                            <input type="text" placeholder="Intro (e.g. Standard warranty coverage:)" value={block.intro || ''} onChange={e => {
                                                                const list = [...terms.sections];
                                                                list[sIdx].blocks[bIdx] = { ...block, intro: e.target.value };
                                                                updateTerms('sections', list);
                                                            }} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                                        </div>
                                                        <input type="text" placeholder="Note (e.g. These periods may be adjusted...)" value={block.note || ''} onChange={e => {
                                                            const list = [...terms.sections];
                                                            list[sIdx].blocks[bIdx] = { ...block, note: e.target.value };
                                                            updateTerms('sections', list);
                                                        }} className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        <div className="flex items-center gap-2 pt-2">
                                            <button onClick={() => {
                                                const list = [...terms.sections];
                                                list[sIdx].blocks.push({ type: 'clause', ref: '', text: '' });
                                                updateTerms('sections', list);
                                            }} className="text-xs font-bold text-slate-500 hover:text-[#1e3a8a] bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm transition-colors">+ Add Clause</button>
                                            <button onClick={() => {
                                                const list = [...terms.sections];
                                                list[sIdx].blocks.push({ type: 'callout', style: 'principle', label: '', text: '' });
                                                updateTerms('sections', list);
                                            }} className="text-xs font-bold text-slate-500 hover:text-[#1e3a8a] bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm transition-colors">+ Add Callout</button>
                                            <button onClick={() => {
                                                const list = [...terms.sections];
                                                list[sIdx].blocks.push({ type: 'table', source: 'warrantyPeriods', intro: '', note: '' });
                                                updateTerms('sections', list);
                                            }} className="text-xs font-bold text-slate-500 hover:text-[#1e3a8a] bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm transition-colors">+ Add Table</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* --- PAYMENT STRUCTURE EDITOR --- */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-[#1e3a8a] text-lg">Payment Structure</h3>
                        <p className="text-sm text-slate-500 mt-1">Configure standard milestone stages for Design and Execution phases.</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPaymentStr(JSON.parse(JSON.stringify(FFDS_PAYMENT_STRUCTURE_DEFAULTS)))}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition"
                        >
                            Load FFDS Defaults
                        </button>
                        <button
                            onClick={() => setPaymentStr(JSON.parse(JSON.stringify(GENERIC_PAYMENT_STRUCTURE_DEFAULTS)))}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                        >
                            Load Generic Defaults
                        </button>
                    </div>
                </div>
                <div className="p-8 space-y-8 font-['Plus_Jakarta_Sans']">
                    
                    {/* Design Stages */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-slate-700">Design Stages</h4>
                            <span className={`text-sm font-bold px-3 py-1 rounded-lg ${dValid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                Total: {dSum}% {dValid ? '(Valid)' : `(Must equal ${reqD}%)`}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {paymentStr.designStages.map((stage, idx) => (
                                <div key={idx} className="flex flex-col gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <div className="flex gap-2 items-center">
                                        <input type="text" value={stage.code} onChange={e => handlePaymentStageUpdate('designStages', idx, 'code', e.target.value)} placeholder="Code" className="w-16 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-mono text-center font-bold" />
                                        <input type="text" value={stage.name} onChange={e => handlePaymentStageUpdate('designStages', idx, 'name', e.target.value)} placeholder="Stage Name" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-bold" />
                                        <input type="number" value={stage.pct} onChange={e => handlePaymentStageUpdate('designStages', idx, 'pct', Number(e.target.value))} placeholder="%" className="w-24 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm text-right" />
                                        <span className="text-slate-400 font-bold">%</span>
                                        <button onClick={() => removePaymentStage('designStages', idx)} className="text-red-400 hover:text-red-600 p-2 ml-2"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                    <div className="flex gap-2 items-center pl-[4.5rem]">
                                        <input type="text" value={stage.trigger} onChange={e => handlePaymentStageUpdate('designStages', idx, 'trigger', e.target.value)} placeholder="Trigger Condition" className="w-1/2 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                        <input type="text" value={stage.unlocks} onChange={e => handlePaymentStageUpdate('designStages', idx, 'unlocks', e.target.value)} placeholder="Unlocks (e.g. 3D renders)" className="w-1/2 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => addPaymentStage('designStages')} className="flex items-center gap-2 text-sm text-[#1e3a8a] font-bold px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100"><Plus className="w-4 h-4" /> Add Design Stage</button>
                        </div>
                    </div>

                    {/* Execution Stages */}
                    <div className="pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-slate-700">Execution Stages</h4>
                            <span className={`text-sm font-bold px-3 py-1 rounded-lg ${eValid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                Total: {eSum}% {eValid ? '(Valid)' : `(Must equal ${reqE}%)`}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {paymentStr.executionStages.map((stage, idx) => (
                                <div key={idx} className="flex flex-col gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <div className="flex gap-2 items-center">
                                        <input type="text" value={stage.code} onChange={e => handlePaymentStageUpdate('executionStages', idx, 'code', e.target.value)} placeholder="Code" className="w-16 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-mono text-center font-bold" />
                                        <input type="text" value={stage.name} onChange={e => handlePaymentStageUpdate('executionStages', idx, 'name', e.target.value)} placeholder="Stage Name" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm font-bold" />
                                        <input type="number" value={stage.pct} onChange={e => handlePaymentStageUpdate('executionStages', idx, 'pct', Number(e.target.value))} placeholder="%" className="w-24 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm text-right" />
                                        <span className="text-slate-400 font-bold">%</span>
                                        <button onClick={() => removePaymentStage('executionStages', idx)} className="text-red-400 hover:text-red-600 p-2 ml-2"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                    <div className="flex gap-2 items-center pl-[4.5rem]">
                                        <input type="text" value={stage.trigger} onChange={e => handlePaymentStageUpdate('executionStages', idx, 'trigger', e.target.value)} placeholder="Trigger Condition" className="w-1/2 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                        <input type="text" value={stage.unlocks} onChange={e => handlePaymentStageUpdate('executionStages', idx, 'unlocks', e.target.value)} placeholder="Unlocks (e.g. Civil work)" className="w-1/2 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#1e3a8a] text-sm" />
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => addPaymentStage('executionStages')} className="flex items-center gap-2 text-sm text-[#1e3a8a] font-bold px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100"><Plus className="w-4 h-4" /> Add Execution Stage</button>
                        </div>
                    </div>

                    {/* Handover Clause */}
                    <div className="pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase">Handover Clause</label>
                            <span className="text-[10px] text-slate-400 italic">Rendered verbatim - not rewritten by AI</span>
                        </div>
                        <textarea value={paymentStr.handoverClause} onChange={e => setPaymentStr({...paymentStr, handoverClause: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-[#1e3a8a] h-24 resize-y text-sm" />
                    </div>

                </div>
            </div>

            {/* SAVE BAR */}
            <div className="flex items-center justify-end gap-4">
                {errorMessage && <span className="text-red-600 font-bold text-sm bg-red-50 px-4 py-2 rounded-xl">{errorMessage}</span>}
                {saveStatus === 'saved' && (
                    <span className="flex items-center gap-2 text-emerald-600 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl">
                        <CheckCircle2 className="w-4 h-4" /> Saved successfully
                    </span>
                )}
                <button 
                    onClick={async () => {
                        if (confirm('Are you sure? This will OVERWRITE your current terms and payment structure with FFDS defaults.')) {
                            try {
                                setSaveStatus('saving');
                                await restoreFFDSDefaults(orgId);
                                const t = await getTermsSettings(orgId);
                                const p = await getPaymentStructure(orgId);
                                if(t) setTerms(t);
                                if(p) setPaymentStr(p);
                                setSaveStatus('saved');
                                setTimeout(() => setSaveStatus('idle'), 3000);
                            } catch (e: any) {
                                setSaveStatus('error');
                                setErrorMessage(e.message);
                            }
                        }
                    }}
                    className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200"
                >
                    Restore FFDS defaults
                </button>
                <button 
                    onClick={handleSave} 
                    disabled={!dValid || !eValid || saveStatus === 'saving'}
                    className={`px-8 py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-95 flex items-center gap-2
                        ${(!dValid || !eValid) ? 'bg-slate-300 cursor-not-allowed text-slate-500' : 'bg-[#1e3a8a] hover:bg-indigo-800'}`}
                >
                    {saveStatus === 'saving' ? 'Saving...' : 'Save Terms & Payment Structure'}
                </button>
            </div>
            
        </div>
    );
}

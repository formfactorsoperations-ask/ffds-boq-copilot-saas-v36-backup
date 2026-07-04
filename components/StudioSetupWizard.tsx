import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrg } from '../contexts/OrgContext';

export default function StudioSetupWizard({ onComplete }: { onComplete?: () => void }) {
    const { orgData, updateOrgData } = useOrg();
    const [step, setStep] = useState(1);
    
    // Step 1 State
    const [studioName, setStudioName] = useState(orgData.orgName || '');
    const [tagline, setTagline] = useState(orgData.tagline || '');
    const [primaryColor, setPrimaryColor] = useState(orgData.themeColor || '#2563EB');
    const [accentColor, setAccentColor] = useState(orgData.accentColor || '#10B981');
    const [logo, setLogo] = useState<string | null>(orgData.orgLogo || null);
    const [legalName, setLegalName] = useState(orgData.legalName || '');
    const [gstin, setGstin] = useState(orgData.gstin || '');
    const [officeAddress, setOfficeAddress] = useState(orgData.officeAddress || '');
    const [contactEmail, setContactEmail] = useState(orgData.contactEmail || '');
    const [contactPhone, setContactPhone] = useState(orgData.contactPhone || '');

    // Step 2 State
    const [defaultFee, setDefaultFee] = useState(orgData.designFeePercentage?.toString() || '10');

    // Step 3 State
    const [accountName, setAccountName] = useState(orgData.bankDetails?.accountName || '');
    const [bankName, setBankName] = useState(orgData.bankDetails?.bankName || '');
    const [accountNumber, setAccountNumber] = useState(orgData.bankDetails?.accountNumber || '');
    const [ifscCode, setIfscCode] = useState(orgData.bankDetails?.ifscCode || '');
    const [upiId, setUpiId] = useState(orgData.bankDetails?.upiId || '');
    const [qrCodeImage, setQrCodeImage] = useState<string | null>(orgData.bankDetails?.qrCodeImage || null);
    
    const handleNext = () => setStep(s => Math.min(s + 1, 4));
    const handlePrev = () => setStep(s => Math.max(s - 1, 1));
    const handleComplete = () => {
        // Build timeline phases to seed
        const defaultTimelinePhases = [
            { phaseName: 'Design & Approvals', description: 'Concept, 3D Renders, BOQ approval', startDay: 0, durationDays: 14 },
            { phaseName: 'Civil & MEP', description: 'Demolition, Wiring, Plumbing, Tiling', startDay: 15, durationDays: 20 },
            { phaseName: 'False Ceiling & Paneling', description: 'Gypsum framing and woodwork backing', startDay: 35, durationDays: 15 },
            { phaseName: 'Carpentry & Finishing', description: 'Laminates, Wardrobes, Kitchen installation', startDay: 50, durationDays: 25 },
            { phaseName: 'Deep Cleaning & Handover', description: 'Snag rectification and final cleanup', startDay: 75, durationDays: 10 }
        ];

        updateOrgData({
            orgName: studioName,
            tagline,
            themeColor: primaryColor,
            accentColor,
            orgLogo: logo || undefined,
            legalName,
            gstin,
            officeAddress,
            contactEmail,
            contactPhone,
            designFeePercentage: parseFloat(defaultFee) || 10,
            defaultTimelinePhases,
            bankDetails: {
                accountName,
                bankName,
                accountNumber,
                ifscCode,
                upiId,
                qrCodeImage: qrCodeImage || undefined
            },
            isSetupComplete: true
        });

        // Initialize Bank logic could be here (e.g. populating FFDS templates to local storage)
        // Since Bank is managed at project/global level in another context, we assume setting state is enough.
        // We'll mimic bank seed by checking local storage or passing it a signal if needed.
        localStorage.setItem('ffds_item_bank_initialized', 'true');

        if (onComplete) onComplete();
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (s: string) => void) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setter(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const isStep1Valid = studioName.trim() !== '';

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <div className="flex items-center justify-between relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0"></div>
                    <div 
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-950 rounded-full z-0 transition-all duration-500"
                        style={{ width: `${((step - 1) / 3) * 100}%` }}
                    ></div>
                    
                    {[1, 2, 3, 4].map((num) => (
                        <div 
                            key={num}
                            className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                                step >= num ? 'bg-indigo-950 text-white' : 'bg-slate-200 text-slate-500'
                            }`}
                        >
                            {num}
                        </div>
                    ))}
                </div>
                <div className="flex justify-between mt-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <span>Brand</span>
                    <span>Defaults</span>
                    <span>Bank Info</span>
                    <span>Item Bank</span>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col relative w-full">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8 md:p-10 flex-grow space-y-8">
                            <div>
                                <h1 className="text-3xl font-black text-indigo-950">Welcome! Let's brand your workspace.</h1>
                                <p className="text-base text-slate-500 mt-2">This brand identity is injected into client portals, contracts, and all generated documents.</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6 text-sm">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Display Name (Required) *</label>
                                        <input type="text" value={studioName} onChange={e => setStudioName(e.target.value)} placeholder="e.g. DesignSpace Interiors" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Tagline</label>
                                        <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Minimal. Elegant. Built." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block font-bold text-slate-700 mb-2">Primary Color</label>
                                            <div className="flex items-center gap-3">
                                                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0" />
                                                <span className="font-mono text-slate-500 uppercase">{primaryColor}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block font-bold text-slate-700 mb-2">Accent Color</label>
                                            <div className="flex items-center gap-3">
                                                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0" />
                                                <span className="font-mono text-slate-500 uppercase">{accentColor}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Studio Logo</label>
                                        <label className="border-2 border-dashed border-slate-200 rounded-xl h-24 flex items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors relative overflow-hidden group">
                                            <input type="file" accept="image/*" onChange={e => handleImageUpload(e, setLogo)} className="hidden" />
                                            {logo ? <img src={logo} alt="Logo" className="h-full w-full object-contain p-2" /> : <span className="text-slate-400 group-hover:text-indigo-950 font-bold tracking-tight">Upload Logo Image</span>}
                                        </label>
                                    </div>
                                </div>
                                <div className="space-y-6 text-sm">
                                    <h3 className="font-black text-indigo-950 uppercase tracking-widest text-xs mb-4">Legal & Contact</h3>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Legal Entity Name</label>
                                        <input type="text" value={legalName} onChange={e => setLegalName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">GSTIN / Tax ID</label>
                                        <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Registered Address</label>
                                        <textarea value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[80px] focus:ring-2 focus:ring-slate-900 outline-none"></textarea>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block font-bold text-slate-700 mb-2">Email</label>
                                            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block font-bold text-slate-700 mb-2">Phone</label>
                                            <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8 md:p-10 flex-grow space-y-6">
                            <div>
                                <h1 className="text-3xl font-black text-indigo-950">Set Operational Defaults.</h1>
                                <p className="text-base text-slate-500 mt-2">Configure default baseline behaviors across projects. These can be overridden per project.</p>
                            </div>

                            <div className="max-w-md space-y-6 text-sm">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-2">Default Design Fee (%)</label>
                                    <div className="relative">
                                        <input type="number" value={defaultFee} onChange={e => setDefaultFee(e.target.value)} className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-slate-900 outline-none" />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">Historically applied as a percentage of total execution base.</p>
                                </div>

                                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                                    <h4 className="font-bold text-indigo-950 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                                        Auto-Seed: Timeline Phases
                                    </h4>
                                    <p className="text-xs text-slate-600 mb-3">AI Timeline generation will securely rely on these base layers:</p>
                                    <ul className="text-xs text-indigo-900 space-y-2 font-mono bg-white p-4 rounded-xl border border-slate-200">
                                        <li>1. Design & Approvals (14d)</li>
                                        <li>2. Civil & MEP (20d)</li>
                                        <li>3. False Ceiling & Paneling (15d)</li>
                                        <li>4. Carpentry & Finishing (25d)</li>
                                        <li>5. Deep Cleaning & Handover (10d)</li>
                                    </ul>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8 md:p-10 flex-grow space-y-6">
                            <div>
                                <h1 className="text-3xl font-black text-indigo-950">Payment Accounts.</h1>
                                <p className="text-base text-slate-500 mt-2">Used directly in the Onboarding Kit and Payment Requests.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                                <div className="space-y-6">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Account Name</label>
                                        <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">Bank Name</label>
                                        <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block font-bold text-slate-700 mb-2">Account Number</label>
                                            <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-indigo-950 font-mono focus:ring-2 focus:ring-slate-900 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block font-bold text-slate-700 mb-2">IFSC Code</label>
                                            <input type="text" value={ifscCode} onChange={e => setIfscCode(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-indigo-950 font-mono focus:ring-2 focus:ring-slate-900 outline-none" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">UPI ID</label>
                                        <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="e.g. xyz@upi" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-slate-900 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-2">UPI / Payment QR Image</label>
                                        <label className="border-2 border-dashed border-slate-200 rounded-xl h-32 flex items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors relative overflow-hidden group">
                                            <input type="file" accept="image/*" onChange={e => handleImageUpload(e, setQrCodeImage)} className="hidden" />
                                            {qrCodeImage ? <img src={qrCodeImage} alt="QR Code" className="h-full w-full object-contain p-2" /> : <div className="text-center"><span className="text-slate-400 group-hover:text-indigo-950 font-bold block">Upload QR Code</span><span className="text-xs text-slate-400">Optional</span></div>}
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 4 && (
                        <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8 md:p-10 flex-grow space-y-6">
                            <div>
                                <h1 className="text-3xl font-black text-indigo-950">Initialize Item Bank.</h1>
                                <p className="text-base text-slate-500 mt-2">Start with FFDS master defaults or import your own Excel database.</p>
                            </div>

                            <div className="grid grid-cols-1 gap-6 mt-8 max-w-xl">
                                <label className="relative p-6 bg-white border-2 border-indigo-950 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors flex items-start gap-4">
                                    <div className="flex-shrink-0 mt-1">
                                        <div className="w-5 h-5 rounded-full border-4 border-indigo-950 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-indigo-950"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-indigo-950 text-lg">Use FFDS Master Templates (Recommended)</h4>
                                        <p className="text-sm text-slate-500 mt-2">Includes 120+ pre-filled items with localized pricing and margins for Indian markets. You can customise them entirely from the Item Bank later.</p>
                                    </div>
                                    <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-800 text-[10px] uppercase tracking-widest px-2 py-1 rounded font-bold">Fastest</div>
                                </label>
                                
                                <label className="relative p-6 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors flex items-start gap-4 opacity-50">
                                    <div className="flex-shrink-0 mt-1">
                                        <div className="w-5 h-5 rounded-full border-2 border-slate-300"></div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h4 className="font-bold text-indigo-950 text-lg">Upload custom Excel BOQ</h4>
                                            <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Pro Feature</span>
                                        </div>
                                        <p className="text-sm text-slate-500 mt-2">Override our standard DB with your studio's precise material specifications via Excel map.</p>
                                    </div>
                                </label>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="p-8 border-t border-slate-100 bg-slate-50 flex justify-between items-center mt-auto">
                    <button 
                        onClick={handlePrev} 
                        disabled={step === 1}
                        className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${step === 1 ? 'opacity-0 cursor-default' : 'text-slate-500 hover:text-indigo-950 bg-white border border-slate-200 shadow-sm hover:shadow-md'}`}
                    >
                        Back
                    </button>
                    {step < 4 ? (
                        <button 
                            onClick={handleNext}
                            disabled={step === 1 && !isStep1Valid}
                            className={`px-8 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 ${step === 1 && !isStep1Valid ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-950 text-white hover:bg-indigo-900 hover:scale-[1.02] active:scale-[0.98]'}`}
                        >
                            Continue →
                        </button>
                    ) : (
                        <button 
                            onClick={handleComplete}
                            className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:bg-emerald-700 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                        >
                            Complete Setup & Launch Workspace 🚀
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

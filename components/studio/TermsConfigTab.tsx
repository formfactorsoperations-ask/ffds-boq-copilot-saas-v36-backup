import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { TermsConfig, TermsConfigClause } from '../../types';

interface SettingProps {
    settings: any;
    updateSettings: (key: string, value: any) => Promise<void>;
    onSaved: () => void;
    isSaved: boolean;
}

export default function TermsConfigTab({ settings, updateSettings, onSaved, isSaved }: SettingProps) {
    const DEFAULT_CONFIG: TermsConfig = {
        warrantyCivilMonths: 12,
        warrantyCarpentryMonths: 12,
        warrantyPaintingMonths: 6,
        warrantyElectricalMonths: 6,
        includedRevisionRounds: 2,
        pauseThresholdDays: 7,
        changeRequestResponseDays: 5,
        snagCategoryADays: 7,
        snagCategoryBDays: 21,
        jurisdiction: "Thane, Maharashtra",
        signatoryName: "Ar. Mayuri Kaulgud",
        signatoryTitle: "Principal Architect",
        customClauses: [],
    };

    const [data, setData] = useState<TermsConfig>({
        ...DEFAULT_CONFIG,
        ...(settings.termsConfig || {})
    });

    const isDirty = JSON.stringify(data) !== JSON.stringify(settings.termsConfig || DEFAULT_CONFIG);

    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        let finalValue: string | number = value;
        if (type === 'number') {
            finalValue = parseInt(value) || 0;
        }
        setData({ ...data, [name]: finalValue });
    };

    const handleSave = async () => {
        await updateSettings('termsConfig', data);
        onSaved();
    };

    return (
         <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">Terms & Docket Configuration</h2>
                        <p className="text-sm text-slate-500 mt-1">Configure parameters used in the static Terms of Engagement Docket.</p>
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Warranty Durations (Months)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Civil</label><input type="number" name="warrantyCivilMonths" value={data.warrantyCivilMonths} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Carpentry</label><input type="number" name="warrantyCarpentryMonths" value={data.warrantyCarpentryMonths} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Painting</label><input type="number" name="warrantyPaintingMonths" value={data.warrantyPaintingMonths} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Electrical</label><input type="number" name="warrantyElectricalMonths" value={data.warrantyElectricalMonths} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Policy Timelines (Days/Limits)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Included Revisions</label><input type="number" name="includedRevisionRounds" value={data.includedRevisionRounds} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Pause Threshold (Days Overdue)</label><input type="number" name="pauseThresholdDays" value={data.pauseThresholdDays} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Snag Cat A (Workmanship) Days</label><input type="number" name="snagCategoryADays" value={data.snagCategoryADays} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Snag Cat B (Material) Days</label><input type="number" name="snagCategoryBDays" value={data.snagCategoryBDays} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" /></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Signatory Data</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Signatory Name</label><input type="text" name="signatoryName" value={data.signatoryName} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Signatory Title</label><input type="text" name="signatoryTitle" value={data.signatoryTitle} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 mb-1">Jurisdiction</label><input type="text" name="jurisdiction" value={data.jurisdiction} onChange={onChange} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                         {isSaved && <div className="text-emerald-600 flex items-center gap-1.5 text-sm font-semibold animate-in fade-in"><CheckCircle2 className="w-4 h-4" /> Saved</div>}
                        <button onClick={handleSave} disabled={!isDirty} className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all ${isDirty ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                            Save Configuration
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

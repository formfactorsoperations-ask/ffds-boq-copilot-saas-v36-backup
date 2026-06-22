import React, { useState, useRef } from 'react';
import { StepProgress, DeliverableProgress } from '../../hooks/useStepProgress';
import { useOrg } from '../../contexts/OrgContext';
import { storage } from '../../services/firebaseClient';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { CheckCircle2, Circle, Paperclip, Download, Loader2 } from 'lucide-react';

interface Props {
    step: StepProgress;
    projectId: string; // To construct storage path
    onUpdateDeliverable: (stepNumber: number, deliverableId: string, updates: Partial<DeliverableProgress>) => void;
    onUpdateSignoff: (stepNumber: number, clientSignoffReceived: boolean) => void;
    onCompleteStep: (stepNumber: number) => void;
}

export function StepDeliverableChecklist({ step, projectId, onUpdateDeliverable, onUpdateSignoff, onCompleteStep }: Props) {
    const { orgData, currentUserAuth } = useOrg();
    const studioId = orgData.tenantId || 'demo-tenant-01';
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showConfirm, setShowConfirm] = useState(false);
    
    // File inputs
    const fileInputRefs = useRef<{ [key: string]: HTMLInputElement }>({});

    const handleFileUpload = async (deliverableId: string, file: File) => {
        if (!storage) return;
        
        // Validation length, size, etc.
        if (file.size > 20 * 1024 * 1024) {
             alert('File exceeds 20MB limit');
             return;
        }

        const path = `studios/${studioId}/projects/${projectId}/deliverables/${step.stepNumber}/${deliverableId}/${file.name}`;
        const storageRef = ref(storage, path);

        setUploadingId(deliverableId);
        setUploadProgress(0);

        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                console.error("Upload failed", error);
                setUploadingId(null);
                alert('Upload failed: ' + error.message);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                onUpdateDeliverable(step.stepNumber, deliverableId, {
                    fileUrl: downloadURL,
                    fileName: file.name
                });
                setUploadingId(null);
            }
        );
    };

    const handleToggleCheck = (d: DeliverableProgress) => {
        const updates: Partial<DeliverableProgress> = {
            checked: !d.checked,
        };
        if (!d.checked) {
            updates.checkedBy = `${currentUserAuth?.email?.split('@')[0] || 'User'} · ${new Date().toLocaleString()}`;
        } else {
            updates.checkedBy = undefined;
        }
        onUpdateDeliverable(step.stepNumber, d.id, updates);
    };

    const allChecked = step.deliverables.every(d => d.checked);
    const canComplete = allChecked && (!step.clientSignoffRequired || step.clientSignoffReceived);

    const pendingCount = (step?.deliverables || []).filter(d => !d.checked).length;
    let tooltip = '';
    if (!canComplete) {
        if (!allChecked) {
            tooltip = `${pendingCount} deliverables still pending`;
        } else if (step.clientSignoffRequired && !step.clientSignoffReceived) {
            tooltip = "Client sign-off required before completing this step";
        }
    }

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm">
                        {step.stepNumber}
                    </span>
                    <h3 className="font-bold text-slate-800">{step.title}</h3>
                </div>
                <div>
                   {step.status === 'completed' && <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">Completed</span>}
                   {step.status === 'in_progress' && <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-1 rounded-full">In Progress</span>}
                   {step.status === 'not_started' && <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">Not Started</span>}
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                <div className="space-y-4">
                    {step.deliverables.map((d) => (
                        <div key={d.id} className="flex flex-col border border-slate-100 rounded-xl p-4 hover:border-slate-200 transition-colors">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4 flex-1">
                                    <button 
                                        onClick={() => handleToggleCheck(d)}
                                        className="mt-1 flex-shrink-0 focus:outline-none"
                                    >
                                        {d.checked ? (
                                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                        ) : (
                                            <Circle className="w-6 h-6 text-slate-300 hover:text-indigo-400" />
                                        )}
                                    </button>
                                    <div>
                                        <p className={`font-medium ${d.checked ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                            {d.label}
                                        </p>
                                        {d.checked && d.checkedBy && (
                                            <p className="text-xs text-slate-400 mt-1">Checked by: {d.checkedBy}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="ml-4 flex-shrink-0 flex items-center gap-2">
                                    {d.fileUrl ? (
                                        <a href={d.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium transition-colors">
                                            <Download className="w-4 h-4" />
                                            {d.fileName}
                                        </a>
                                    ) : (
                                        <>
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                ref={el => { if(el) fileInputRefs.current[d.id] = el; }}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleFileUpload(d.id, file);
                                                    e.target.value = '';
                                                }}
                                                accept=".pdf,.jpg,.jpeg,.png,.dwg,.zip"
                                            />
                                            <button 
                                                onClick={() => fileInputRefs.current[d.id]?.click()}
                                                disabled={uploadingId === d.id}
                                                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                                            >
                                                {uploadingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                                                Upload
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            {uploadingId === d.id && (
                                <div className="mt-4 bg-slate-100 h-2 rounded-full overflow-hidden">
                                     <div className="bg-indigo-500 h-full" style={{ width: `${uploadProgress}%` }}></div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {step.clientSignoffRequired && (
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <label className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                checked={step.clientSignoffReceived}
                                onChange={(e) => onUpdateSignoff(step.stepNumber, e.target.checked)}
                            />
                            <div>
                                <p className="font-bold text-amber-900">Client has signed off on this step</p>
                                <p className="text-sm text-amber-700">This step requires formal approval from the client.</p>
                            </div>
                        </label>
                    </div>
                )}

                {step.status !== 'completed' && (
                    <div className="mt-8 flex justify-end">
                        {!showConfirm ? (
                            <div className="relative group">
                                <button
                                    onClick={() => setShowConfirm(true)}
                                    disabled={!canComplete}
                                    className="px-6 py-3 bg-slate-900 disabled:bg-slate-300 text-white font-bold rounded-xl disabled:cursor-not-allowed transition-colors shadow-sm"
                                >
                                    Mark Step Complete
                                </button>
                                {!canComplete && tooltip && (
                                    <div className="absolute bottom-full mb-2 right-0 hidden group-hover:block bg-slate-800 text-white text-xs font-medium px-3 py-2 rounded-lg whitespace-nowrap">
                                        {tooltip}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl animate-fade-in">
                                <p className="font-medium text-slate-800">Complete Step {step.stepNumber}: {step.title}? This will trigger the payment milestone.</p>
                                <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg">Cancel</button>
                                <button onClick={() => { setShowConfirm(false); onCompleteStep(step.stepNumber); }} className="px-4 py-2 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-600">Yes, Complete</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

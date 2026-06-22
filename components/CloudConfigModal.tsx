
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveFirebaseConfig, clearFirebaseConfig, isFirebaseConfigured, setForceLocalMode } from '../services/firebaseClient';
import { db } from '../services/dbService'; // Import DB Service
import { CloseIcon, UploadIcon, CheckIcon, DeleteIcon, SparklesIcon, BriefcaseIcon } from './Icons';

interface CloudConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CloudConfigModal: React.FC<CloudConfigModalProps> = ({ isOpen, onClose }) => {
    const [jsonInput, setJsonInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSeeding, setIsSeeding] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [confirmSync, setConfirmSync] = useState(false);
    const [confirmSeed, setConfirmSeed] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [stats, setStats] = useState<{ localCount: number; cloudCount: number | null; cloudStatus: string } | null>(null);
    
    const isConfigured = isFirebaseConfigured();
    const isLocalMode = localStorage.getItem('ffds_force_local_mode') === 'true';

    useEffect(() => {
        if (isOpen) {
            checkStats();
            setConfirmSync(false);
            setConfirmSeed(false);
        }
    }, [isOpen, isConfigured]);

    const checkStats = async () => {
        const s = await db.getDebugStats();
        setStats(s);
    }

    const handleSave = () => {
        setIsConnecting(true);
        try {
            // STRATEGY 1: Smart Regex Extraction
            const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
            const config: any = {};
            let foundCount = 0;

            keys.forEach(key => {
                const regex = new RegExp(`${key}\\s*:\\s*(["'])(.*?)\\1`);
                const match = jsonInput.match(regex);
                if (match && match[2]) {
                    config[key] = match[2];
                    foundCount++;
                }
            });

            if (config.apiKey && config.projectId) {
                saveFirebaseConfig(config);
                return;
            }

            // STRATEGY 2: Strict JSON Parse
            try {
                const parsed = JSON.parse(jsonInput);
                if (parsed.apiKey && parsed.projectId) {
                    saveFirebaseConfig(parsed);
                    return;
                }
            } catch (e) {}

            throw new Error("Could not find valid 'apiKey' and 'projectId' in the pasted text.");

        } catch (e) {
            console.error(e);
            setError("Invalid Format. Please copy the whole 'const firebaseConfig = { ... }' block from Firebase Console.");
            setIsConnecting(false);
        }
    };

    const handleSeedData = async () => {
        setIsSeeding(true);
        await db.seedMasterData();
        setIsSeeding(false);
        setConfirmSeed(false);
        checkStats();
        window.location.reload();
    };

    const handleSyncProjects = async () => {
        setIsSyncing(true);
        await db.syncLocalToCloud();
        setIsSyncing(false);
        setConfirmSync(false);
        checkStats();
        window.location.reload();
    };

    const MotionDiv = motion.div as any;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                <MotionDiv 
                    initial={{ opacity: 0, scale: 0.95 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                >
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">Cloud Database Setup</h3>
                            <p className="text-xs text-slate-500">Connect to Firebase Firestore</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* 1. STATUS DASHBOARD */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 text-center">
                                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Local Storage</p>
                                <p className="text-2xl font-black text-slate-700">{stats?.localCount ?? '-'}</p>
                                <p className="text-[10px] text-slate-400 font-medium">Projects</p>
                            </div>
                            <div className={`p-3 rounded-xl border text-center transition-colors ${stats?.cloudStatus === 'Connected' ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`}>
                                <p className={`text-[10px] uppercase font-bold tracking-wider mb-1 ${stats?.cloudStatus === 'Connected' ? 'text-indigo-500' : 'text-red-500'}`}>Cloud Database</p>
                                <p className={`text-2xl font-black ${stats?.cloudStatus === 'Connected' ? 'text-indigo-700' : 'text-red-700'}`}>
                                    {stats?.cloudCount ?? '-'}
                                </p>
                                <p className={`text-[10px] font-bold ${stats?.cloudStatus === 'Connected' ? 'text-indigo-400' : 'text-red-400'}`}>{stats?.cloudStatus}</p>
                            </div>
                        </div>

                        {isLocalMode ? (
                            <div className="space-y-4">
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3">
                                    <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                                        <SparklesIcon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="font-bold text-amber-800 text-sm">MVP / Local Mode Active</h4>
                                        <p className="text-xs text-amber-700 mt-1">
                                            Your app is saving data only to this browser.
                                        </p>
                                        <button 
                                            onClick={() => setForceLocalMode(false)}
                                            className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                        >
                                            <UploadIcon className="w-3 h-3" /> Reconnect to Cloud Database
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : isConfigured ? (
                            <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3">
                                    <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
                                        <CheckIcon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="font-bold text-emerald-800 text-sm">Successfully Connected</h4>
                                        <p className="text-xs text-emerald-700 mt-1">
                                            Your app is syncing with Firebase.
                                        </p>
                                        <div className="flex gap-4 mt-3">
                                            <button 
                                                onClick={clearFirebaseConfig}
                                                className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                                            >
                                                <DeleteIcon className="w-3 h-3" /> Disconnect & Reset
                                            </button>
                                            <button 
                                                onClick={() => setForceLocalMode(true)}
                                                className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1"
                                            >
                                                Force MVP / Local Mode
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* ADMIN TOOLS */}
                                <div className="border-t border-slate-100 pt-4 space-y-3">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Data Migration Tools</h4>
                                    
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        {!confirmSync ? (
                                            <button 
                                                onClick={() => setConfirmSync(true)}
                                                disabled={isSyncing}
                                                className="w-full py-2 bg-blue-50 border border-blue-100 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 mb-1"
                                            >
                                                {isSyncing ? 'Syncing...' : <><BriefcaseIcon className="w-3.5 h-3.5" /> Sync Local Projects to Cloud</>}
                                            </button>
                                        ) : (
                                            <div className="flex gap-2 mb-1">
                                                <button 
                                                    onClick={handleSyncProjects}
                                                    disabled={isSyncing}
                                                    className="flex-1 py-2 bg-red-500 text-white font-bold text-xs rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                                                >
                                                    {isSyncing ? 'Syncing...' : 'Confirm Sync'}
                                                </button>
                                                <button 
                                                    onClick={() => setConfirmSync(false)}
                                                    disabled={isSyncing}
                                                    className="px-3 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-300 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-[9px] text-slate-400 text-center">
                                            Uploads all locally saved projects + versions to Firebase.
                                        </p>
                                    </div>

                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        {!confirmSeed ? (
                                            <button 
                                                onClick={() => setConfirmSeed(true)}
                                                disabled={isSeeding}
                                                className="w-full py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 mb-1"
                                            >
                                                {isSeeding ? 'Uploading...' : <><SparklesIcon className="w-3.5 h-3.5" /> Upload Default Bank & Templates</>}
                                            </button>
                                        ) : (
                                            <div className="flex gap-2 mb-1">
                                                <button 
                                                    onClick={handleSeedData}
                                                    disabled={isSeeding}
                                                    className="flex-1 py-2 bg-red-500 text-white font-bold text-xs rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                                                >
                                                    {isSeeding ? 'Uploading...' : 'Confirm Upload'}
                                                </button>
                                                <button 
                                                    onClick={() => setConfirmSeed(false)}
                                                    disabled={isSeeding}
                                                    className="px-3 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-300 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-[9px] text-slate-400 text-center">
                                            Initializes database with FFDS standards (Use once).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="border-t border-slate-100 pt-4">
                                    <p className="text-sm text-slate-600 mb-2">
                                        Paste your <strong>firebaseConfig</strong> code block below:
                                    </p>
                                    <textarea 
                                        value={jsonInput}
                                        onChange={e => { setJsonInput(e.target.value); setError(null); }}
                                        placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  ...\n};`}
                                        className="w-full h-32 p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none placeholder:text-slate-300"
                                    />
                                    {error && <p className="text-xs text-red-500 font-bold mt-2">{error}</p>}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 items-center">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold text-sm hover:bg-slate-200 rounded-lg">Close</button>
                        {(!isConfigured && !isLocalMode) && (
                            <>
                                <button 
                                    onClick={() => setForceLocalMode(true)}
                                    className="px-4 py-2 text-amber-600 font-bold text-sm hover:bg-amber-50 rounded-lg ml-auto"
                                >
                                    Force MVP Mode
                                </button>
                                <button 
                                    onClick={handleSave}
                                    disabled={isConnecting}
                                    className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 shadow-lg flex items-center gap-2 disabled:bg-indigo-400"
                                >
                                    {isConnecting ? 'Connecting...' : <><UploadIcon className="w-4 h-4" /> Connect</>}
                                </button>
                            </>
                        )}
                    </div>
                </MotionDiv>
            </div>
        </AnimatePresence>
    );
};

export default CloudConfigModal;

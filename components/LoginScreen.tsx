import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LockIcon, AlertCircleIcon, BriefcaseIcon, UserIcon, ArrowRightIcon } from './Icons';
import { FullProjectData } from '../types';
import { useOrg } from '../contexts/OrgContext';
import { auth, db } from '../services/firebaseClient';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { setCachedAccessToken } from '../services/authService';

interface LoginScreenProps {
    projects: FullProjectData[];
    portalProjectId: string | null;
    onLoginClient: (project: FullProjectData) => void;
    onLoginOps: () => void;
}

export default function LoginScreen({ projects, portalProjectId, onLoginClient, onLoginOps }: LoginScreenProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpsLogin, setIsOpsLogin] = useState(true);
    const { orgData, updateOrgData, setCurrentRole } = useOrg();

    const handleClientLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        setTimeout(() => {
            const trimmedEmail = email.trim().toLowerCase();
            
            if (!trimmedEmail) {
                setError('Please enter your email address.');
                setIsLoading(false);
                return;
            }

            let matchedProject;
            if (portalProjectId) {
                const project = projects.find(p => p.id === portalProjectId);
                if (project && project.context.clientEmail) {
                    const allowedEmails = project.context.clientEmail.split(',').map(e => e.trim().toLowerCase());
                    if (allowedEmails.includes(trimmedEmail)) {
                        matchedProject = project;
                    }
                }
            } else {
                matchedProject = projects.find(p => {
                    if (!p.context.clientEmail) return false;
                    const allowedEmails = p.context.clientEmail.split(',').map(e => e.trim().toLowerCase());
                    return allowedEmails.includes(trimmedEmail);
                });
            }

            if (matchedProject) {
                onLoginClient(matchedProject);
            } else {
                setError('No project found for this email address. Please check with your project manager.');
                setIsLoading(false);
            }
        }, 800);
    };

    const handleOpsLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (auth && db) {
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Check for user tenant context
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                
                let tenantId = 'demo-tenant-01'; // Fallback logic for legacy users
                let userRole = user.email === 'formfactors.operations@gmail.com' ? 'Super Admin' : 'Admin';
                if (userDoc.exists()) {
                    tenantId = userDoc.data().tenantId || 'demo-tenant-01';
                    if (user.email !== 'formfactors.operations@gmail.com') {
                        userRole = userDoc.data().role || userRole;
                    }
                } else {
                    // Create user profile for new login preserving FFDS compatibility
                    await setDoc(userDocRef, {
                        email: user.email,
                        tenantId: 'demo-tenant-01',
                        role: 'Admin'
                    });
                }
                
                try {
                    const orgDoc = await getDoc(doc(db, "organizations", tenantId));
                    if (orgDoc.exists() && orgDoc.data().team) {
                        const team = orgDoc.data().team;
                        const matchingMember = team.find((m: any) => m.email.toLowerCase() === user.email?.toLowerCase());
                        if (matchingMember && matchingMember.role) {
                            userRole = matchingMember.role;
                            await setDoc(userDocRef, { role: userRole }, { merge: true });
                        }
                    }
                } catch (e) {
                    console.error("Could not sync organization team status");
                }
                
                // Sync to context
                updateOrgData({ tenantId, contactEmail: email });
                setCurrentRole(userRole as any);
                onLoginOps();
            } catch (err: any) {
                setError(err.message || 'Authentication failed');
                setIsLoading(false);
            }
        } else {
            // Local fallback when Firebase is not configured
            setTimeout(() => {
                onLoginOps();
            }, 800);
        }
    };

    const handleGoogleLogin = async () => {
        if (!auth || !db) return;
        setError('');
        setIsLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            // Removed calendar scope here to prevent login failures during API propagation
            const userCredential = await signInWithPopup(auth, provider);
            
            const credential = GoogleAuthProvider.credentialFromResult(userCredential);
            if (credential?.accessToken) {
                setCachedAccessToken(credential.accessToken);
            }
            
            const user = userCredential.user;
            
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            
            let tenantId = 'demo-tenant-01';
            let userRole = user.email === 'formfactors.operations@gmail.com' ? 'Super Admin' : 'Admin';
            if (userDoc.exists()) {
                tenantId = userDoc.data().tenantId || 'demo-tenant-01';
                if (user.email !== 'formfactors.operations@gmail.com') {
                    userRole = userDoc.data().role || userRole;
                }
            } else {
                await setDoc(userDocRef, {
                    email: user.email,
                    tenantId: 'demo-tenant-01',
                    role: 'Admin'
                });
            }

            // Sync with organization's team list for latest role
            try {
                const orgDoc = await getDoc(doc(db, "organizations", tenantId));
                if (orgDoc.exists() && orgDoc.data().team) {
                    const team = orgDoc.data().team;
                    const matchingMember = team.find((m: any) => m.email.toLowerCase() === user.email?.toLowerCase());
                    if (matchingMember && matchingMember.role) {
                        userRole = matchingMember.role;
                        await setDoc(userDocRef, { role: userRole }, { merge: true });
                    }
                }
            } catch (e) {
                console.error("Could not sync organization team status");
            }
            
            updateOrgData({ tenantId, contactEmail: user.email || '' });
            setCurrentRole(userRole as any);
            onLoginOps();
        } catch (err: any) {
            if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
                const domain = window.location.hostname;
                setError(`Firebase Domain Error: Please add "${domain}" to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
            } else {
                setError(err.message || 'Google Auth failed');
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-indigo-950 flex font-sans overflow-hidden">
            {/* Left Side - Image & Branding */}
            <motion.div 
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="hidden lg:flex lg:w-1/2 relative bg-indigo-950 items-end p-12"
            >
                <div className="absolute inset-0">
                    <img 
                        src="https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2000&auto=format&fit=crop" 
                        alt="Interior Design" 
                        className="w-full h-full object-cover opacity-60"
                        referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
                </div>
                
                <div className="relative z-10 max-w-lg">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.6 }}
                    >
                        <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-2xl mb-8 border border-white/20">
                            OS
                        </div>
                        <h1 className="text-5xl font-black text-white leading-tight tracking-tight mb-4">
                            Interior Execution OS
                        </h1>
                        <p className="text-xl text-slate-300 font-light">
                            The intelligent execution layer for interior design firms.
                        </p>
                    </motion.div>
                </div>
            </motion.div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-white relative">
                <div className="absolute top-8 right-8 lg:hidden">
                    <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">
                        FF
                    </div>
                </div>

                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                    className="w-full max-w-md"
                >
                    <AnimatePresence mode="wait">
                        {isOpsLogin ? (
                            <motion.form 
                                key="ops-login"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                onSubmit={handleOpsLogin} 
                                className="space-y-6"
                            >
                                <div className="mb-10">
                                    <h2 className="text-3xl font-black text-indigo-950 mb-2">
                                        Sign in
                                    </h2>
                                    <p className="text-slate-500">
                                        Studio owner or team member
                                    </p>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Email</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <UserIcon className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <input 
                                            type="email" 
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-900/10 focus:border-indigo-950 focus:bg-white outline-none transition-all font-medium text-indigo-950"
                                            placeholder="you@yourstudio.com"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <LockIcon className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <input 
                                            type="password" 
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-900/10 focus:border-indigo-950 focus:bg-white outline-none transition-all font-medium text-indigo-950"
                                            placeholder="••••••••"
                                            required
                                        />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {error && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-4 bg-rose-50 text-rose-600 text-sm rounded-2xl border border-rose-100 flex items-start gap-3">
                                                <AlertCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                                <p className="font-medium">{error}</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button 
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 bg-indigo-950 text-white rounded-2xl font-bold shadow-lg shadow-indigo-950/20 hover:bg-indigo-900 hover:shadow-indigo-950/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <motion.div 
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                        />
                                    ) : (
                                        <>
                                            Sign in &rarr;
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center gap-4 my-6">
                                    <div className="flex-1 h-px bg-slate-200"></div>
                                    <span className="text-sm font-medium text-slate-400">or</span>
                                    <div className="flex-1 h-px bg-slate-200"></div>
                                </div>
                                
                                <button
                                    type="button"
                                    className="w-full py-4 bg-white text-slate-700 border-2 border-slate-200 rounded-2xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3"
                                    onClick={handleGoogleLogin}
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                    Continue with Google
                                </button>

                                <div className="pt-8 text-center text-sm">
                                    <span className="text-slate-500">Viewing a client proposal? </span>
                                    <button 
                                        type="button"
                                        onClick={() => { setIsOpsLogin(false); setError(''); }}
                                        className="text-indigo-950 font-bold hover:underline"
                                    >
                                        Open client link
                                    </button>
                                </div>
                            </motion.form>
                        ) : (
                            <motion.form 
                                key="client-login"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.3 }}
                                onSubmit={handleClientLogin} 
                                className="space-y-6"
                            >
                                <div className="mb-10">
                                    <h2 className="text-3xl font-black text-indigo-950 mb-2">
                                        Client Portal
                                    </h2>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Email</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <UserIcon className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <input 
                                            type="email" 
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white outline-none transition-all font-medium text-indigo-950"
                                            placeholder="client@example.com"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                                
                                <AnimatePresence>
                                    {error && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-4 bg-rose-50 text-rose-600 text-sm rounded-2xl border border-rose-100 flex items-start gap-3">
                                                <AlertCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                                <p className="font-medium">{error}</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button 
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <motion.div 
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                        />
                                    ) : (
                                        <>
                                            Access Portal
                                            <ArrowRightIcon className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <div className="pt-8 text-center text-sm">
                                    <span className="text-slate-500">Studio owner? </span>
                                    <button 
                                        type="button"
                                        onClick={() => { setIsOpsLogin(true); setError(''); }}
                                        className="text-indigo-950 font-bold hover:underline"
                                    >
                                        Sign in here
                                    </button>
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
}

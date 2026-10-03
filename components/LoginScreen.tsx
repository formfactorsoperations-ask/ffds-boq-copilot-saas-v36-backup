import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LockIcon, AlertCircleIcon, UserIcon } from './Icons';
import { useOrg } from '../contexts/OrgContext';
import { auth, db } from '../services/firebaseClient';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, User, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { syncStudioAccess, NO_STUDIO_MESSAGE } from '../services/studioAccess';
import { setCachedAccessToken } from '../services/authService';
import { StudioDeskLogo, TervaroMark } from './brand/StudioDeskLogo';
import { BRAND } from '../lib/brand';

interface LoginScreenProps {
    onLoginOps: () => void;
    /**
     * Set (to the signed-in email) when a studio-issued login is still on its
     * temporary password. The screen then asks for a new one instead of
     * offering sign-in.
     */
    mustSetPasswordFor?: string;
    onPasswordSet?: () => void;
}

/**
 * The studio door.
 *
 * It used to carry a second form that took a project code or email address and
 * posted a portal link out to the client. That was the whole of client access
 * once — the link was the credential. Clients now have accounts, so the form
 * offered a slower route to a door they can simply knock on, and a project code
 * typed here told a stranger which codes were real.
 *
 * There is no client entry here at all now. Studio staff never cross to the
 * client side, and clients arrive on the portal link their studio sent them —
 * which is the only thing that names a project — so an option for them on this
 * screen was a door nobody walks through.
 */
const PLATFORM_OWNER = 'formfactors.operations@gmail.com';

/*
    Which studio this account belongs to, and as what.

    This screen used to decide it. A first sign-in wrote the profile itself --
    `tenantId: 'demo-tenant-01', role: 'Admin'` -- so any Google account became
    an Admin, and every sign-in copied a role from the team list into the
    profile from the browser. The rules now refuse both, and the syncStudioAccess
    function settles it from the studio's own team list.

    If the function cannot be reached, the stored profile is used as it is.
    Nothing is ever created here: an account with no profile gets no access.
*/
async function resolveStudioAccess(user: User): Promise<{ tenantId: string; role: string } | 'none'> {
    const ownerRole = (role: string) => (user.email === PLATFORM_OWNER ? 'Super Admin' : role);

    const access = await syncStudioAccess();
    if (access) {
        if (access.access === 'none') return 'none';
        return { tenantId: access.tenantId || 'demo-tenant-01', role: ownerRole(access.role) };
    }

    const snap = await getDoc(doc(db!, 'users', user.uid));
    const data = snap.exists() ? (snap.data() as any) : null;
    if (!data?.role && user.email !== PLATFORM_OWNER) return 'none';
    return { tenantId: data?.tenantId || 'demo-tenant-01', role: ownerRole(data?.role || 'Admin') };
}

export default function LoginScreen({ onLoginOps, mustSetPasswordFor, onPasswordSet }: LoginScreenProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { orgData, updateOrgData, setCurrentRole } = useOrg();

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (newPassword.length < 8) {
            setError('Choose a password of at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Those two passwords do not match.');
            return;
        }
        if (!auth?.currentUser || !db) return;
        setIsLoading(true);
        try {
            await updatePassword(auth.currentUser, newPassword);
            await setDoc(doc(db, 'users', auth.currentUser.uid),
                { mustChangePassword: false, updatedAt: Date.now() }, { merge: true });
            setNewPassword('');
            setConfirmPassword('');
            onPasswordSet?.();
        } catch (err: any) {
            setError(err?.code === 'auth/requires-recent-login'
                ? 'For your security, sign out and sign in again with the temporary password, then set your new one.'
                : err?.message || 'Could not set that password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
    const handleOpsLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (auth && db) {
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                const resolved = await resolveStudioAccess(user);
                if (resolved === 'none') {
                    await auth.signOut().catch(() => {});
                    setError(NO_STUDIO_MESSAGE);
                    setIsLoading(false);
                    return;
                }
                const { tenantId, role: userRole } = resolved;

                // Sync to context
                updateOrgData({ tenantId, contactEmail: email });
                setCurrentRole(userRole as any);

                // Still on a temporary password: stay here. App passes
                // mustSetPasswordFor once it has read the same profile.
                const profile = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
                if (profile?.exists() && profile.data()?.mustChangePassword) {
                    setIsLoading(false);
                    return;
                }
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
            
            const resolved = await resolveStudioAccess(user);
            if (resolved === 'none') {
                await auth.signOut().catch(() => {});
                setError(NO_STUDIO_MESSAGE);
                setIsLoading(false);
                return;
            }
            const { tenantId, role: userRole } = resolved;

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

    /*
        Shared field and button styling.

        The old screen dressed a solid primary button in `bg-[#3D52A0]/90`,
        `backdrop-blur-md` and `border-white/20` — three treatments meant for
        glass sitting on top of an opaque fill, which only washed the colour out
        against white. Buttons are solid here, and depth comes from a shadow in
        the button's own hue rather than a translucent border.
    */
    const fieldClass =
        'w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[15px] font-medium text-slate-900 ' +
        'placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-[#3D52A0] focus:ring-4 focus:ring-[#3D52A0]/10 ' +
        'outline-none transition-[background-color,border-color,box-shadow] duration-200';

    const primaryClass =
        'w-full py-4 bg-[#3D52A0] hover:bg-[#334486] active:bg-[#00459e] text-white rounded-2xl font-bold text-[15px] ' +
        'shadow-lg shadow-[#3D52A0]/25 hover:shadow-[#3D52A0]/35 transition-all flex items-center justify-center gap-2 ' +
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none';

    /*
        Motion.

        MotionConfig in index.tsx is set to reducedMotion="user", so every
        transform and layout animation below is dropped for anyone whose system
        asks for less motion — including the ambient loops, which are the ones
        that would otherwise never stop. Nothing here is load-bearing: the
        screen is entirely usable with all of it switched off.
    */
    const EASE = [0.22, 1, 0.36, 1];

    /** Right column: one entrance, children following in sequence. */
    const column = {
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
    };
    const rise = {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
    };

    return (
        <div className="min-h-screen bg-white flex font-sans">
            {/* Left: the product, stated once. */}
            <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative bg-slate-950 flex-col justify-between p-12 xl:p-14 overflow-hidden">
                {/* The photograph drifts, very slowly. At 24 seconds for a 6%
                    scale it never reads as movement — it reads as the page not
                    being a screenshot. */}
                <motion.img
                    src="https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2000&auto=format&fit=crop"
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover opacity-[0.28] grayscale-[0.35]"
                    initial={{ scale: 1.04 }}
                    animate={{ scale: 1.12 }}
                    transition={{ duration: 24, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
                    referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/70 to-[#00306b]/70" />

                {/* Two slow lights. Blurred to the point of being weather
                    rather than shapes, which is what keeps them from competing
                    with the headline. */}
                <motion.div
                    aria-hidden="true"
                    className="absolute -top-24 -left-16 w-[26rem] h-[26rem] rounded-full bg-[#3D52A0]/25 blur-[100px]"
                    animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
                    transition={{ duration: 18, ease: 'easeInOut', repeat: Infinity }}
                />
                <motion.div
                    aria-hidden="true"
                    className="absolute bottom-[-6rem] right-[-4rem] w-[22rem] h-[22rem] rounded-full bg-sky-400/15 blur-[90px]"
                    animate={{ x: [0, -30, 0], y: [0, -24, 0] }}
                    transition={{ duration: 22, ease: 'easeInOut', repeat: Infinity, delay: 1.5 }}
                />

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.6, ease: EASE }}
                    className="relative z-10"
                >
                    <StudioDeskLogo tone="dark" byline />
                </motion.div>

                <div className="relative z-10 max-w-lg">
                    {/* Line by line, each rising out of its own overflow box —
                        the type arrives as writing rather than as a block
                        fading in. The lines are BRAND.descriptor, broken by
                        hand so the break falls where the sense does. */}
                    <h1 className="text-[40px] xl:text-[48px] font-black text-white leading-[1.06] tracking-tight">
                        {['The operating system', 'for design and build', 'studios.'].map((line, i) => (
                            <span key={line} className="block overflow-hidden">
                                <motion.span
                                    className="block"
                                    initial={{ y: '105%' }}
                                    animate={{ y: '0%' }}
                                    transition={{ delay: 0.2 + i * 0.1, duration: 0.75, ease: EASE }}
                                >
                                    {line}
                                </motion.span>
                            </span>
                        ))}
                    </h1>

                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.6, ease: EASE }}
                        className="text-[17px] text-slate-300/90 font-light mt-5 leading-relaxed"
                    >
                        Price the work, run the site, and show every client exactly where
                        their money went — in one place.
                    </motion.p>

                    <div className="mt-10 grid grid-cols-3 gap-3">
                        {[
                            ['BOQ', 'that becomes the contract'],
                            ['Margin', 'while the job is running'],
                            ['Portal', 'your client actually opens'],
                        ].map(([head, tail], i) => (
                            <motion.div
                                key={head}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.62 + i * 0.09, duration: 0.55, ease: EASE }}
                                whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.10)' }}
                                className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm px-3.5 py-3 cursor-default"
                            >
                                <p className="text-white font-extrabold text-[13px]">{head}</p>
                                <p className="text-slate-400 text-[11.5px] font-medium leading-snug mt-0.5">{tail}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* The company's line, signed. */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.95, duration: 0.8, ease: EASE }}
                    className="relative z-10 flex items-center text-[12px] font-semibold text-white/45 tracking-wide"
                >
                    <TervaroMark className="w-6 h-6 mr-2.5" />
                    <span className="text-white/80">{BRAND.tagline}</span>
                    <span className="mx-2 text-white/25">—</span>
                    {BRAND.company}
                </motion.p>
            </div>

            {/* Right: the form, and nothing competing with it. */}
            <div className="w-full lg:w-[54%] xl:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-white relative">
                <div className="absolute top-7 left-6 sm:left-10 lg:hidden">
                    <StudioDeskLogo size="sm" />
                </div>

                {mustSetPasswordFor !== undefined ? (
                    /*
                        A login the studio created arrives with a temporary
                        password, read aloud or pasted into a message. It is
                        replaced here before the studio opens -- the same step
                        client logins already take on their own door.
                    */
                    <form onSubmit={handleSetPassword} className="w-full max-w-[400px] space-y-5 hud-panel-in">
                        <div className="mb-6">
                            <p className="text-[11px] font-black tracking-[0.18em] uppercase text-[#3D52A0] mb-2.5">
                                One more step
                            </p>
                            <h2 className="text-[30px] font-black text-slate-900 tracking-tight leading-tight">
                                Choose your own password
                            </h2>
                            <p className="text-slate-500 font-medium mt-2.5 text-[14.5px]">
                                You signed in{mustSetPasswordFor ? ` as ${mustSetPasswordFor}` : ''} with a temporary
                                password from your studio. Replace it to continue.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="new-password" className="block text-[12.5px] font-bold text-slate-700 mb-2">New password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <LockIcon className="h-[18px] w-[18px] text-slate-400" />
                                </div>
                                <input id="new-password" type="password" value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className={fieldClass} placeholder="At least 8 characters"
                                    autoComplete="new-password" required />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className="block text-[12.5px] font-bold text-slate-700 mb-2">Type it again</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <LockIcon className="h-[18px] w-[18px] text-slate-400" />
                                </div>
                                <input id="confirm-password" type="password" value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={fieldClass} autoComplete="new-password" required />
                            </div>
                        </div>
                        {error && (
                            <div className="p-4 bg-rose-50 text-rose-700 text-sm rounded-2xl border border-rose-100 flex items-start gap-3">
                                <AlertCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <p className="font-semibold leading-relaxed">{error}</p>
                            </div>
                        )}
                        <button type="submit" disabled={isLoading} className={primaryClass}>
                            {isLoading ? 'Saving…' : 'Set password and continue'}
                        </button>
                        <button type="button"
                            onClick={() => { auth?.signOut().catch(() => {}); setError(''); }}
                            className="w-full text-[13px] font-bold text-slate-500 hover:text-slate-800">
                            Sign out
                        </button>
                    </form>
                ) : (
                <motion.form
                    variants={column}
                    initial="hidden"
                    animate="show"
                    onSubmit={handleOpsLogin}
                    className="w-full max-w-[400px] space-y-5"
                >
                    <motion.div variants={rise} className="mb-8">
                        <p className="text-[11px] font-black tracking-[0.18em] uppercase text-[#3D52A0] mb-2.5">
                            Studio
                        </p>
                        <h2 className="text-[34px] font-black text-slate-900 tracking-tight leading-none">
                            Welcome back
                        </h2>
                        <p className="text-slate-500 font-medium mt-2.5 text-[14.5px]">
                            Sign in to your studio workspace.
                        </p>
                    </motion.div>

                    <motion.div variants={rise}>
                        <label className="block text-[12.5px] font-bold text-slate-700 mb-2">Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <UserIcon className="h-[18px] w-[18px] text-slate-400" />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={fieldClass}
                                placeholder="you@yourstudio.com"
                                autoComplete="username"
                                required
                            />
                        </div>
                    </motion.div>

                    <motion.div variants={rise}>
                        <div className="flex items-baseline justify-between mb-2">
                            <label className="block text-[12.5px] font-bold text-slate-700">Password</label>
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="text-[11.5px] font-bold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <LockIcon className="h-[18px] w-[18px] text-slate-400" />
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={fieldClass}
                                placeholder="Your password"
                                autoComplete="current-password"
                                required
                            />
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: EASE }}
                                className="overflow-hidden"
                            >
                                {/* One short shake. Enough to say the form
                                    answered, not enough to be a personality. */}
                                <motion.div
                                    initial={{ x: 0 }}
                                    animate={{ x: [0, -7, 6, -4, 0] }}
                                    transition={{ duration: 0.38, ease: 'easeOut' }}
                                    className="p-4 bg-rose-50 text-rose-700 text-sm rounded-2xl border border-rose-100 flex items-start gap-3"
                                >
                                    <AlertCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <p className="font-semibold leading-relaxed">{error}</p>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.div variants={rise}>
                        <motion.button
                            type="submit"
                            disabled={isLoading}
                            whileHover={isLoading ? undefined : { y: -1 }}
                            whileTap={isLoading ? undefined : { scale: 0.985 }}
                            transition={{ duration: 0.15, ease: EASE }}
                            className={primaryClass}
                        >
                            {isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                />
                            ) : (
                                <>Sign in</>
                            )}
                        </motion.button>
                    </motion.div>

                    <motion.div variants={rise} className="flex items-center gap-4 py-1">
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">or</span>
                        <div className="flex-1 h-px bg-slate-200" />
                    </motion.div>

                    <motion.div variants={rise}>
                        <motion.button
                            type="button"
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.985 }}
                            transition={{ duration: 0.15, ease: EASE }}
                            className="w-full py-3.5 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold text-[14.5px] hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-center gap-3 cursor-pointer"
                            onClick={handleGoogleLogin}
                        >
                            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Continue with Google
                        </motion.button>
                    </motion.div>


                </motion.form>
                )}
            </div>
        </div>
    );
}

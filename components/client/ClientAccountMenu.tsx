import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebaseClient';

const MotionDiv = motion.div as any;

interface Props {
  /** The client's own name, as the studio recorded it. */
  clientName?: string;
  /** Which project this session is looking at. */
  projectName?: string;
  onSignOut: () => void;
}

/**
 * The client's own account, inside their portal.
 *
 * A client signs in with a password their studio generated for them and, until
 * now, had nowhere to change it — the forced change on first sign-in was the
 * only chance they ever got. Anyone who kept the issued password kept it for
 * good, and it had travelled to them over WhatsApp or email.
 *
 * Changing it asks for the current one rather than relying on the session.
 * Firebase would accept `updatePassword` on a recent sign-in alone, but that
 * makes an unattended, still-signed-in browser enough to take the account, and
 * it fails with `auth/requires-recent-login` on an older session anyway.
 */
export default function ClientAccountMenu({ clientName, projectName, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const email = auth?.currentUser?.email || '';

  // Close on a click anywhere else, and on Escape — a panel that can only be
  // dismissed by finding its own button again is a panel people leave open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const resetForm = () => {
    setChanging(false);
    setCurrent(''); setNext(''); setConfirm('');
    setError(''); setDone(false);
  };

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (next.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (next !== confirm) { setError('Those two passwords do not match.'); return; }
    if (next === current) { setError('That is the password you already have.'); return; }

    const user = auth?.currentUser;
    if (!user?.email || !db) { setError('Cannot reach the sign-in service. Please try again shortly.'); return; }

    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      await setDoc(
        doc(db, 'users', user.uid),
        { mustChangePassword: false, updatedAt: Date.now() },
        { merge: true },
      );
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: any) {
      const code = err?.code || '';
      setError(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'That current password is not right.'
          : code === 'auth/weak-password'
            ? 'Choose a stronger password.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Please wait a few minutes and try again.'
              : err?.message || 'Could not change the password. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const initial = (clientName || email || '?').trim().charAt(0).toUpperCase();

  const field =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-900 ' +
    'placeholder:text-slate-400 focus:bg-white focus:border-[#3D52A0] focus:ring-4 focus:ring-[#3D52A0]/10 outline-none ' +
    'transition-[background-color,border-color,box-shadow] duration-200 disabled:opacity-60';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => { setOpen(o => !o); if (open) resetForm(); }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="w-6 h-6 rounded-full bg-[#3D52A0] text-white text-[10px] font-black grid place-items-center">
          {initial}
        </span>
        <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 max-w-[130px] truncate">
          {clientName || email || 'Your account'}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <MotionDiv
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            role="menu"
            className="absolute right-0 mt-2 w-[300px] z-50 bg-white rounded-2xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(15,23,42,0.18)] overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Signed in as</p>
              <p className="text-[13px] font-bold text-slate-900 mt-1 break-all">{email || '—'}</p>
              {clientName && (
                <p className="text-[12px] font-medium text-slate-500 mt-0.5">{clientName}</p>
              )}
              {projectName && (
                <p className="text-[11.5px] font-medium text-slate-400 mt-1.5">{projectName}</p>
              )}
            </div>

            <div className="p-3">
              <AnimatePresence mode="wait" initial={false}>
                {!changing ? (
                  <MotionDiv
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-1"
                  >
                    {done && (
                      <p className="text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-2">
                        Password changed.
                      </p>
                    )}
                    <button
                      onClick={() => { setChanging(true); setDone(false); }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      Change password
                    </button>
                    <button
                      onClick={onSignOut}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
                    >
                      Sign out
                    </button>
                  </MotionDiv>
                ) : (
                  <MotionDiv
                    key="form"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <form onSubmit={handleChange} className="space-y-2.5 px-1 pb-1">
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        placeholder="Current password"
                        className={field}
                        disabled={busy}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        placeholder="New password"
                        className={field}
                        disabled={busy}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Type the new one again"
                        className={field}
                        disabled={busy}
                      />

                      {error && (
                        <p className="text-[12px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 leading-relaxed">
                          {error}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="submit"
                          disabled={busy}
                          className="flex-1 bg-[#3D52A0] hover:bg-[#334486] text-white py-2.5 rounded-xl font-bold text-[12.5px] transition-colors disabled:opacity-60 cursor-pointer"
                        >
                          {busy ? 'Saving…' : 'Save password'}
                        </button>
                        <button
                          type="button"
                          onClick={resetForm}
                          className="px-3 py-2.5 rounded-xl text-[12.5px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </MotionDiv>
                )}
              </AnimatePresence>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

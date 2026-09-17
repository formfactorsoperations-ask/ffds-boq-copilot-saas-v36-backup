import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseClient';
import { buildWhatsAppURL } from '../lib/whatsappUtils';

const MotionDiv = motion.div as any;
const MotionImg = motion.img as any;
const MotionSpan = motion.span as any;
const MotionForm = motion.form as any;
const MotionButton = motion.button as any;

const EASE = [0.22, 1, 0.36, 1];

interface Props {
  /** Studio branding and contact, read from the public organizations document. */
  studio?: { name?: string; logo?: string; phone?: string; email?: string };
  /** Why the last attempt to open a portal stopped, if it did. */
  notice?: string | null;
  /** Set when a client is signed in but has no project to be shown. */
  signedInAs?: string | null;
  /** Ends the session behind `signedInAs`. */
  onSignOut?: () => void;
}

/**
 * The client's door.
 *
 * Same app, same Firebase Auth, same credentials store as the studio sign-in —
 * what differs is the dress and, after sign-in, the destination. The route the
 * client arrived on decides which studio's name and mark they see; their
 * `users/{uid}.role` decides where they land. Never the other way round: a URL
 * must not be able to grant a view of anything.
 *
 * Access used to be the portal link itself, which meant a forwarded WhatsApp
 * message was a working key. The link now only says which project to open once
 * somebody has proved who they are.
 *
 * It carries the same weight of presentation as the studio door, and for a
 * better reason: this is a client's first sight of their designer's software,
 * arriving from a message. A bare form on a grey field reads as a form someone
 * threw up, which is not what you want a client thinking about the studio whose
 * name is on it. The words belong to the studio, not to us.
 */
export default function ClientLoginScreen({
  studio,
  notice,
  signedInAs,
  onSignOut,
}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** Set once a temp password has been accepted and must be replaced. */
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const studioName = studio?.name || 'your design studio';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter the email and password your studio gave you.');
      return;
    }
    if (!auth || !db) {
      setError('Cannot reach the sign-in service. Please try again shortly.');
      return;
    }

    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const profile = await getDoc(doc(db, 'users', cred.user.uid));
      if (profile.exists() && profile.data()?.mustChangePassword) {
        setMustChange(true);
      }
      // Routing is App's job, off the role on the profile. Nothing to do here.
    } catch {
      /*
        One message for every failure. Distinguishing "no such account" from
        "wrong password" tells someone probing which client emails are real.
      */
      setError('That email and password did not match. Ask your studio to resend your details.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
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

    setBusy(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        { mustChangePassword: false, updatedAt: Date.now() },
        { merge: true },
      );
      setMustChange(false);
    } catch (err: any) {
      setError(err?.message || 'Could not set that password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 min-h-[50px] text-[15px] font-medium text-slate-900 ' +
    'placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-[#3D52A0] focus:ring-4 focus:ring-[#3D52A0]/10 ' +
    'outline-none transition-[background-color,border-color,box-shadow] duration-200 disabled:opacity-60';

  const primaryButton =
    'w-full bg-[#3D52A0] hover:bg-[#334486] active:bg-[#00459e] text-white py-4 rounded-2xl font-bold text-[15px] ' +
    'shadow-lg shadow-[#3D52A0]/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';

  const banner = (tone: 'amber' | 'rose', text: string) => (
    <MotionDiv
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={
        tone === 'amber'
          ? 'text-[12.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 leading-relaxed'
          : 'text-[12.5px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 leading-relaxed'
      }
    >
      {text}
    </MotionDiv>
  );

  /*
    The studio's mark.

    It sat on the dark panel, which meant wrapping it in a white chip so a dark
    logo stayed legible — a box around someone's identity, and on the side of
    the screen the eye reaches second. It belongs with the form, on white, where
    the client is actually looking and where the logo needs no container.

    180px tall, width following the image's own proportions — `max-w-full` so a
    very wide wordmark shrinks to the column rather than overflowing it on a
    phone. The initial-chip fallback is scaled to match, since a studio without
    an uploaded logo should not get a mark five times smaller.
  */
  const brandMark = studio?.logo ? (
    <img
      src={studio.logo}
      alt={studioName}
      className="h-[180px] w-auto max-w-full object-contain object-left"
    />
  ) : (
    <span className="inline-flex items-center gap-4">
      <span className="w-20 h-20 rounded-3xl grid place-items-center font-black text-3xl bg-[#3D52A0] text-white shadow-sm">
        {studioName.trim().charAt(0).toUpperCase()}
      </span>
      <span className="text-[22px] font-extrabold tracking-tight text-slate-900 leading-tight">
        {studioName}
      </span>
    </span>
  );

  /*
    How to ask for credentials, from someone who cannot get in.

    "Ask your studio — they can issue one for you" was true and useless: a
    locked-out client is on a sign-in screen, not in their inbox, and the studio
    was not named or reachable from here. WhatsApp leads because that is how
    these details were sent in the first place.

    Both are drawn from the studio's own organizations document. If neither is
    recorded there, the original sentence stands rather than an empty row of
    buttons — with the studio named, since there is nothing else to go on.

    buildWhatsAppURL rather than the raw number: studio contact numbers are
    stored the way they are typed, and this one is ten digits with no country
    code, which wa.me will not route. That helper already carries the app's
    India default, and reusing it keeps this link behaving like every other
    WhatsApp link in the app rather than inventing a second rule.
  */
  const waHref = studio?.phone
    ? buildWhatsAppURL(
        studio.phone,
        "Hello, I'm trying to sign in to my client portal and need my login details.",
      )
    : '';
  const contactAction =
    'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[12.5px] font-bold transition-colors cursor-pointer';

  const helpLine = waHref || studio?.email ? (
    <div className="space-y-2.5">
      <p className="text-[12.5px] text-slate-400 text-center leading-relaxed">
        Haven't got your sign-in details?
      </p>
      <div className="flex gap-2.5">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${contactAction} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300`}
          >
            WhatsApp us
          </a>
        )}
        {studio?.email && (
          <a
            href={`mailto:${studio.email}?subject=${encodeURIComponent('Client portal sign-in')}`}
            className={`${contactAction} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300`}
          >
            Email us
          </a>
        )}
      </div>
    </div>
  ) : (
    <p className="text-[12.5px] text-slate-400 text-center leading-relaxed">
      Haven't got your sign-in details? Ask {studioName} — they can issue them for you.
    </p>
  );

  /* Right column: one entrance, children following in sequence. */
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
      {/* Left: the studio, and what this place is for.

          Everything here belongs to the designer — their mark, their name, and
          a description of the client's own project rather than a pitch for the
          software. A client following a link from WhatsApp should recognise who
          they are signing in to before they recognise what they are signing in
          with. */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative bg-slate-950 flex-col justify-end p-12 xl:p-14 overflow-hidden">
        <MotionImg
          src="https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2000&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-[0.3] grayscale-[0.3]"
          initial={{ scale: 1.04 }}
          animate={{ scale: 1.12 }}
          transition={{ duration: 24, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/70 to-[#00306b]/70" />

        {/* Two slow lights, blurred to the point of being weather rather than
            shapes — which is what keeps them from competing with the type. */}
        <MotionDiv
          aria-hidden="true"
          className="absolute -top-24 -left-16 w-[26rem] h-[26rem] rounded-full bg-[#3D52A0]/25 blur-[100px]"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, ease: 'easeInOut', repeat: Infinity }}
        />
        <MotionDiv
          aria-hidden="true"
          className="absolute bottom-[-6rem] right-[-4rem] w-[22rem] h-[22rem] rounded-full bg-sky-400/15 blur-[90px]"
          animate={{ x: [0, -30, 0], y: [0, -24, 0] }}
          transition={{ duration: 22, ease: 'easeInOut', repeat: Infinity, delay: 1.5 }}
        />

        <div className="relative z-10 max-w-lg">
          {/* Line by line, each rising out of its own overflow box, so the type
              arrives as writing rather than as a block fading in. */}
          <h1 className="text-[42px] xl:text-[50px] font-black text-white leading-[1.05] tracking-tight">
            {['Your project,', 'in one place.'].map((line, i) => (
              <span key={line} className="block overflow-hidden">
                <MotionSpan
                  className="block"
                  initial={{ y: '105%' }}
                  animate={{ y: '0%' }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.75, ease: EASE }}
                >
                  {line}
                </MotionSpan>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: EASE }}
            className="text-[17px] text-slate-300/90 font-light mt-5 leading-relaxed"
          >
            Everything {studioName} has sent you — what is decided, what is drawn,
            and what is still waiting on you.
          </motion.p>

          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              ['Decisions', 'that hold up the work'],
              ['Drawings', 'as they are issued'],
              ['Payments', 'and what they are for'],
            ].map(([head, tail], i) => (
              <MotionDiv
                key={head}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62 + i * 0.09, duration: 0.55, ease: EASE }}
                whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.10)' }}
                className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm px-3.5 py-3 cursor-default"
              >
                <p className="text-white font-extrabold text-[13px]">{head}</p>
                <p className="text-slate-400 text-[11.5px] font-medium leading-snug mt-0.5">{tail}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>

      {/* Right: the form, and nothing competing with it. */}
      <div className="w-full lg:w-[54%] xl:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-[400px]">
          {/* Whose portal this is, above everything else on the column — at
              every width, so a client on a phone sees it too. */}
          <MotionDiv
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-7"
          >
            {brandMark}
          </MotionDiv>

          <AnimatePresence mode="wait" initial={false}>
            {signedInAs ? (
              /*
                Signed in, but with nowhere to go. Showing the sign-in form again
                would be a lie — the credentials worked. Say what actually
                stopped it and offer the only two moves that can help.
              */
              <MotionDiv
                key="blocked"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="space-y-5"
              >
                <div>
                  <h1 className="text-[32px] font-black text-slate-900 tracking-tight leading-none">
                    You're signed in
                  </h1>
                  <p className="text-[14px] text-slate-500 font-medium mt-2.5 break-all">{signedInAs}</p>
                </div>

                {banner(
                  'amber',
                  notice ||
                    'There is no project ready for you to open yet. Your studio will let you know when there is.',
                )}

                <MotionButton
                  type="button"
                  onClick={onSignOut}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.15, ease: EASE }}
                  className={primaryButton}
                >
                  Sign out
                </MotionButton>

                <p className="text-[12.5px] text-slate-400 text-center leading-relaxed">
                  Expecting to see a project? Ask {studioName} to publish it to your portal.
                </p>
              </MotionDiv>
            ) : !mustChange ? (
              <MotionForm
                key="signin"
                variants={column}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -8 }}
                onSubmit={handleSignIn}
                className="space-y-5"
              >
                {/* The studio's name is on the mark directly above, so
                    repeating it in the sentence below only made the line
                    longer. "Your studio" reads as the same studio, because it
                    is the one the client is looking at. */}
                <MotionDiv variants={rise} className="mb-8">
                  <p className="text-[13px] font-black tracking-[0.2em] uppercase text-[#3D52A0] mb-3">
                    Client Portal
                  </p>
                  <h1 className="text-[32px] font-black text-slate-900 tracking-tight leading-none">
                    Welcome to your project
                  </h1>
                  <p className="text-slate-500 font-medium mt-3 text-[14.5px] leading-relaxed">
                    Sign in with the email and password your studio sent you.
                  </p>
                </MotionDiv>

                <AnimatePresence>{notice ? banner('amber', notice) : null}</AnimatePresence>

                <MotionDiv variants={rise}>
                  <label className="block text-[12.5px] font-bold text-slate-700 mb-2">Email</label>
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={field}
                    disabled={busy}
                  />
                </MotionDiv>

                <MotionDiv variants={rise}>
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="block text-[12.5px] font-bold text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-[11.5px] font-bold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="The password your studio sent"
                    className={field}
                    disabled={busy}
                  />
                </MotionDiv>

                <AnimatePresence>
                  {error && (
                    <MotionDiv
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="overflow-hidden"
                    >
                      {/* One short shake. Enough to say the form answered, not
                          enough to be a personality. */}
                      <MotionDiv
                        animate={{ x: [0, -7, 6, -4, 0] }}
                        transition={{ duration: 0.38, ease: 'easeOut' }}
                      >
                        {banner('rose', error)}
                      </MotionDiv>
                    </MotionDiv>
                  )}
                </AnimatePresence>

                <MotionDiv variants={rise}>
                  <MotionButton
                    type="submit"
                    disabled={busy}
                    whileHover={busy ? undefined : { y: -1 }}
                    whileTap={busy ? undefined : { scale: 0.985 }}
                    transition={{ duration: 0.15, ease: EASE }}
                    className={primaryButton}
                  >
                    {busy ? 'Signing in…' : 'Sign in'}
                  </MotionButton>
                </MotionDiv>

                <MotionDiv variants={rise}>{helpLine}</MotionDiv>
              </MotionForm>
            ) : (
              <MotionForm
                key="change"
                variants={column}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -8 }}
                onSubmit={handleChangePassword}
                className="space-y-5"
              >
                <MotionDiv variants={rise} className="mb-8">
                  <p className="text-[11px] font-black tracking-[0.18em] uppercase text-[#3D52A0] mb-2.5">
                    One last thing
                  </p>
                  <h1 className="text-[32px] font-black text-slate-900 tracking-tight leading-none">
                    Choose a password
                  </h1>
                  <p className="text-slate-500 font-medium mt-2.5 text-[14.5px] leading-relaxed">
                    The one you were given was temporary. Pick something only you know.
                  </p>
                </MotionDiv>

                <MotionDiv variants={rise}>
                  <label className="block text-[12.5px] font-bold text-slate-700 mb-2">New password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={field}
                    disabled={busy}
                  />
                </MotionDiv>

                <MotionDiv variants={rise}>
                  <label className="block text-[12.5px] font-bold text-slate-700 mb-2">Type it again</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={field}
                    disabled={busy}
                  />
                </MotionDiv>

                <AnimatePresence>
                  {error && (
                    <MotionDiv
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="overflow-hidden"
                    >
                      {banner('rose', error)}
                    </MotionDiv>
                  )}
                </AnimatePresence>

                <MotionDiv variants={rise}>
                  <MotionButton
                    type="submit"
                    disabled={busy}
                    whileHover={busy ? undefined : { y: -1 }}
                    whileTap={busy ? undefined : { scale: 0.985 }}
                    transition={{ duration: 0.15, ease: EASE }}
                    className={primaryButton}
                  >
                    {busy ? 'Saving…' : 'Save and continue'}
                  </MotionButton>
                </MotionDiv>
              </MotionForm>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}

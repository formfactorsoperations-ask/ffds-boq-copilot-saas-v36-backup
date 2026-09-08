import React from 'react';
import { motion } from 'framer-motion';
import { Sun, SunMedium, MoonStar } from 'lucide-react';
import { LampContainer } from '../ui/lamp';
import WavyText from '../ui/WavyText';

/**
 * The client's welcome.
 *
 * The overview opened on an eyebrow and a heading — factually complete and
 * completely cold. A client signing for seven figures arrives anxious, and the
 * first thing they met was a label. This is the studio's own Home hero turned
 * around to face outward: the same lamp, the same greeting, addressed to the
 * client instead of the studio.
 *
 * It says two things: hello, and whether anything is waiting on them.
 *
 * It used to carry four rows — greeting, status, two context chips, and two
 * buttons — which is a dashboard wearing a welcome's clothing, and it pushed
 * the page's actual content below the fold. The stage, the handover date and
 * "Catch me up" now live in the lens bar, which is sticky, so they stay with
 * the reader instead of scrolling away. "Contact PM" is gone outright: it
 * opened the very same dialog as "Contact studio" in the header a few
 * centimetres above it.
 */

interface Props {
  clientName?: string;
  attentionCount: number;
}

export default function PortalHero({ clientName, attentionCount }: Props) {
  const hr = new Date().getHours();

  /**
   * Who to greet, out of a name written the way clients actually write them.
   *
   * This took the first word, so "Mr Prasad & Mrs Mrunal Naik" was greeted as
   * "Good evening, Mr" — the honorific, and only one of the two people who own
   * the project. Honorifics are dropped and a joint name keeps both first
   * names, because greeting one half of a couple by title is worse than not
   * greeting them at all.
   */
  const first = (() => {
    const raw = (clientName || '').trim();
    if (!raw) return 'there';
    const HONORIFICS = /^(mr|mrs|ms|miss|mx|dr|prof|shri|smt|sri|m\/s|messrs)\.?$/i;
    const firstNameOf = (part: string) => {
      const words = part.trim().split(/\s+/).filter(w => !HONORIFICS.test(w));
      return words[0] || '';
    };
    const people = raw.split(/\s*(?:&|\band\b|\+)\s*/i).map(firstNameOf).filter(Boolean);
    if (people.length === 0) return 'there';
    if (people.length === 1) return people[0];
    // Two owners read naturally; more than that becomes a list nobody wants.
    return people.length === 2
      ? `${people[0]} & ${people[1]}`
      : `${people[0]} & ${people.length - 1} others`;
  })();

  let greeting = 'Good morning';
  let TimeIcon = Sun;
  let iconStyle = 'text-amber-400 bg-amber-400/10 border-amber-400/25 shadow-[0_0_12px_rgba(251,191,36,0.25)]';
  if (hr >= 12 && hr < 17) {
    greeting = 'Good afternoon';
    TimeIcon = SunMedium;
    iconStyle = 'text-amber-300 bg-amber-300/10 border-amber-300/25 shadow-[0_0_12px_rgba(252,211,77,0.25)]';
  } else if (hr >= 17 || hr < 5) {
    greeting = 'Good evening';
    TimeIcon = MoonStar;
    iconStyle = 'text-indigo-300 bg-indigo-400/10 border-indigo-400/25 shadow-[0_0_12px_rgba(165,180,252,0.25)]';
  }

  return (
    <LampContainer
      theme="studio"
      containerHeight="min-h-[8.5rem] sm:min-h-[10rem]"
      className="rounded-2xl sm:rounded-3xl border border-slate-800/80 shadow-md"
    >
      {/* LampContainer lifts its slot by 4rem/5rem so a two-line greeting sits
          under the beam. This block is five rows tall, so that same lift left a
          void below it — the translate cancels it and lets the container centre
          the content properly. Studio Home's own hero is untouched. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="translate-y-4 sm:translate-y-10 flex flex-col items-center text-center gap-2 w-full max-w-4xl px-3 sm:px-6 py-2 sm:py-1 font-['Plus_Jakarta_Sans']">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-snug sm:leading-tight text-white flex items-center gap-2 sm:gap-2.5 flex-wrap justify-center text-center">
          <span>{greeting},</span>
          <span className="bg-gradient-to-r from-sky-400 via-sky-500 to-amber-300 bg-clip-text text-transparent">
            {first}
          </span>
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`p-1 sm:p-1.5 rounded-full border flex items-center justify-center shrink-0 ${iconStyle}`}
            title={greeting}
          >
            <TimeIcon className="w-4 h-4 sm:w-5 h-5" />
          </motion.span>
        </h1>

        <div className="text-[11px] sm:text-sm font-medium flex items-center justify-center gap-2 text-slate-300 text-center max-w-full px-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              attentionCount > 0 ? 'bg-rose-400' : 'bg-emerald-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              attentionCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'
            }`} />
          </span>
          <span className="inline-block text-slate-300 leading-snug">
            {attentionCount > 0
              ? `You have ${attentionCount} ${attentionCount === 1 ? 'item' : 'items'} requiring your attention today.`
              : 'Nothing needs you right now — we\'ll be in touch as the project moves.'}
          </span>
        </div>

      </motion.div>
    </LampContainer>
  );
}

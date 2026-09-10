import React from 'react';
import { DraftingCompass, Stamp, House, KeyRound, Handshake, PackageCheck, Milestone } from 'lucide-react';

/**
 * The glyph for a milestone, picked from what the milestone is called.
 *
 * The flag says "a date lands here"; it says the same thing on every row. The
 * icon says *which* date, which is the part anyone scanning a programme is
 * actually looking for — and it survives being read at a glance, in a language
 * the client did not have to learn from a legend.
 *
 * Matched on the label rather than the id: the two milestones the builder emits
 * have stable ids, but a studio can add its own, and "Client Handover" should
 * get the keys whatever it is called underneath.
 */
const RULES: Array<{ test: RegExp; render: (cls: string) => React.ReactNode }> = [
  /*
    Handover: the house *and* the key. Neither alone says "it is yours now" —
    a house is any milestone about the property, a key is any milestone about
    access. Kept narrow deliberately: "Site Possession" is the studio taking
    the site, not the client getting it, and it should not wear the keys.
  */
  {
    test: /handover|hand[- ]?over/i,
    render: cls => (
      <span className={`relative inline-flex ${cls}`}>
        <House className="w-full h-full" strokeWidth={2.25} />
        <KeyRound
          className="absolute -right-[3px] -bottom-[2px] w-[9px] h-[9px] stroke-[2.75]"
          style={{ filter: 'drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff)' }}
        />
      </span>
    ),
  },
  // The design gate is a drawing-board decision, so it gets the compasses.
  { test: /design|concept|scheme/i, render: cls => <DraftingCompass className={cls} strokeWidth={2.25} /> },
  // Good For Construction is a drawing being stamped and released.
  { test: /gfc|good for construction|issue|release|approval|sign[- ]?off/i,
    render: cls => <Stamp className={cls} strokeWidth={2.25} /> },
  { test: /snag|defect|closeout|close[- ]?out|completion/i,
    render: cls => <PackageCheck className={cls} strokeWidth={2.25} /> },
  { test: /kick[- ]?off|start|award|contract|agreement/i,
    render: cls => <Handshake className={cls} strokeWidth={2.25} /> },
];

export default function MilestoneIcon({ label, className = 'w-3 h-3' }: { label: string; className?: string }) {
  const rule = RULES.find(r => r.test.test(label));
  return <>{rule ? rule.render(className) : <Milestone className={className} strokeWidth={2.25} />}</>;
}

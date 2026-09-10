/*
  The programme, at the level a first-cut proposal should state it.

  The project schedule is a CPM plan of site trades — ten overlapping phases
  with exact start days. That is the right level for running the job and the
  wrong level for a proposal that has not been through design freeze: it
  invites scrutiny the first cut cannot support, and overlapping day ranges
  read as confusion rather than confidence.

  Two facts shaped this:

    - The schedule contains no design phase. It begins at site mobilisation.
      The booklet nevertheless claimed "14 working days of design and 111 of
      site execution", which it reached by subtracting a hardcoded 14 from the
      execution total — an imaginary design phase carved out of site work.
    - Annexure A states the programme is counted from the date design is
      frozen, payment received and the site made available. So design belongs
      *before* the clock starts, not inside it.

  This groups the schedule into a handful of named stages, reports them in
  weeks rather than days, and puts design where it actually happens: first,
  and outside the site programme.
*/

export interface SchedulePhase {
  phaseName: string;
  description?: string;
  startDay: number;
  durationDays: number;
}

export interface ProgrammeStage {
  /** 'Design' sits before the site programme and carries no site day range. */
  kind: 'design' | 'site';
  title: string;
  /** Week range for a site stage, or the lead-in note for design. */
  meta: string;
  desc: string;
}

/** Working days to whole weeks, for the design lead-in note. */
const toWeek = (day: number): number => Math.max(1, Math.ceil(day / 5));

interface StageSpec {
  title: string;
  match: RegExp;
  desc: string;
}

/*
  Four site stages, matched on what the schedule actually calls its phases.
  A phase that matches nothing lands in the stage nearest its start day, so an
  unfamiliar trade name still appears somewhere sensible rather than vanishing.
*/
const SITE_STAGES: StageSpec[] = [
  {
    title: 'Site setup & civil',
    match: /mobilis|mobiliz|protection|demolition|civil|waterproof|masonry|plaster/i,
    desc: 'Mobilisation, surface protection, demolition, civil changes and waterproofing.',
  },
  {
    title: 'Services & ceilings',
    match: /mep|electrical|plumbing|conduit|ceiling|first fix/i,
    desc: 'Electrical and plumbing first fix, false ceiling framing and conduit routing.',
  },
  {
    title: 'Carpentry & finishes',
    match: /carpentry|modular|kitchen|tiling|stone|counter|paint|polish|laminate|glass|mirror|veneer/i,
    desc: 'Tiling and stone, carpentry carcass and assembly, polish, laminate and base coats.',
  },
  {
    title: 'Fittings & handover',
    match: /\bfinal\b|snag|handover|deep clean/i,
    desc: 'Final fixtures and sanitary ware, final coat, joint snag, deep clean and handover.',
  },
];

/*
  The order the patterns are asked in, written out.

  "Final MEP Fixtures & Sanitary Installation" contains both 'mep' and
  'final'; "Final Painting, Snagging & Deep Cleaning" contains both 'paint'
  and 'snag'. Whichever pattern is asked first wins, so the narrow
  end-of-job pattern has to come before the broad trade ones — otherwise the
  handover stage is emptied and the middle stages stretch across the job.

  Written as an explicit list of indices rather than derived from a priority
  field: the order is the whole point, so it should be readable at a glance.
*/
const MATCH_ORDER: number[] = [3, 0, 1, 2]; // handover, setup, services, carpentry

/**
 * Collapse a CPM schedule into the stages a proposal should show.
 *
 * `designDays` is stated as a lead-in, never subtracted from the site
 * programme — doing that is what produced the fabricated 14/111 split.
 */
export const groupPhasesIntoStages = (
  phases: SchedulePhase[],
  designDays: number,
): ProgrammeStage[] => {
  const design: ProgrammeStage = {
    kind: 'design',
    title: 'Design & planning',
    meta: `About ${toWeek(designDays)} week${toWeek(designDays) === 1 ? '' : 's'}, before site start`,
    desc: 'Validation, layouts, 3D, Schedule of Finishes freeze, GFC drawings and final BOQ.',
  };

  const list = (phases || []).filter((p) => p && p.phaseName);
  if (list.length === 0) return [design];

  // Assign each phase to a stage; anything unmatched goes by position.
  const buckets: SchedulePhase[][] = SITE_STAGES.map(() => []);
  const unmatched: SchedulePhase[] = [];
  list.forEach((p) => {
    const idx = MATCH_ORDER.find((i) => SITE_STAGES[i].match.test(p.phaseName));
    if (idx !== undefined) buckets[idx].push(p);
    else unmatched.push(p);
  });

  if (unmatched.length) {
    const lastEnd = Math.max(...list.map((p) => (p.startDay || 0) + (p.durationDays || 0)));
    unmatched.forEach((p) => {
      const frac = lastEnd > 0 ? (p.startDay || 0) / lastEnd : 0;
      const idx = Math.min(SITE_STAGES.length - 1, Math.floor(frac * SITE_STAGES.length));
      buckets[idx].push(p);
    });
  }

  const site: ProgrammeStage[] = [];
  buckets.forEach((members, i) => {
    if (members.length === 0) return; // a stage with no work is not a stage
    /*
      Sequence, not dates.

      The real phases overlap heavily — trades run in parallel — so a week band
      per stage produces ranges like "weeks 4-24" beside "weeks 7-25", which
      reads as confusion rather than a plan. A first-cut proposal states the
      order of work and the overall duration; the day-level schedule is an
      operations artefact and belongs in the programme, not the pitch.
    */
    site.push({
      kind: 'site',
      title: SITE_STAGES[i].title,
      meta: `Stage ${site.length + 1}`,
      desc: SITE_STAGES[i].desc,
    });
  });

  return [design, ...site];
};

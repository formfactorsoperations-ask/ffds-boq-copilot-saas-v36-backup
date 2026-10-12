# StudioDesk design rules

Every new screen, panel and modal follows these rules. Copy the reference screens rather than
inventing a look: a new screen should be indistinguishable in type, colour, surfaces and motion
from **Studio settings** (`components/studio/StudioSettingsConsole.tsx`), **Templates & Bank**
(`components/TemplatesAndBankTab.tsx`) and the project-header modals
(`components/projectHeader/AssignProjectsModal.tsx`).

Before shipping a screen, put a screenshot of it next to Studio settings. If anything looks
different, fix it before shipping.

## Type

- The family is set once in `src/typography.css` (Plus Jakarta Sans, overridable per studio).
  **Never set `font-family`** and never load another font. The serif and display faces in
  `src/index.css` belong to the home hero only.
- Use the scale in `src/typography.css` only. **No half-pixel sizes** (`text-[12.5px]`, `text-[13.5px]`, …):
  the guard snaps them anyway, and they show the screen was not built on the scale.

| Use | Class |
|---|---|
| Page title | `ConsoleHeader` (renders `text-2xl font-bold text-slate-800 tracking-tight`) |
| Section / card title | `font-bold text-slate-800` (16px default) |
| Row title, rail item, button | `text-sm font-semibold` (buttons `font-bold`) |
| Body text and meta | `text-xs text-slate-500` |
| Secondary lines, helper text | `text-[11px] text-slate-500` |
| Field labels, eyebrows, column heads | `text-[10px] font-bold uppercase tracking-wider text-slate-500` |
| Figures | `font-black text-slate-800 tabular-nums`, counting up with `CountUp` |

- Weights: `font-semibold` and `font-bold` for text, `font-black` for figures only. Do not use
  `font-extrabold` on new console screens.

## Colour

- Brand: `#3D52A0` (hover `#334486`). Brand tint: `bg-[#3D52A0]/10 text-[#3D52A0]`.
- Neutrals: slate only. Text `slate-800` / `slate-700` / `slate-500` / `slate-400`. Card borders `slate-200`,
  input borders `slate-300`, hover fills `slate-50` / `slate-100`.
- State: rose (bad), amber (warning), emerald (good), and nothing else. Use the `Dot` from
  `components/ui/HudBits.tsx` for a state light.
- **Do not add new accent colours** (teal, purple, orange icon tiles, and so on). An icon sits in the brand
  tint chip or in plain `slate-400`.

## Surfaces

- **Page header:** `components/ui/ConsoleHeader.tsx`. It provides the glass card, title, state light,
  drawn rule and blurb, with a `panel` for figures and `actions` for buttons. Do not build a separate header.
- **Section rail:** copy the Studio settings rail.
  - Each item: `px-3 py-2.5 rounded-xl text-sm font-semibold`.
  - Active item: `bg-[#3D52A0] text-white shadow-sm hud-rail-active`.
  - Inactive item: `text-slate-700 hover:bg-slate-100`.
  - Icons: `text-slate-400` when inactive, white when active.
- **Content card:** the `Panel` pattern.
  - Card: `bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in`.
  - Header: a `w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0]` icon chip, a `font-bold text-slate-800` title and a `text-xs text-slate-500` blurb.
- **Lists inside a card:** `divide-y divide-slate-100` rows, or `rounded-xl border border-slate-200` items.
  No stacks of separate shadowed cards.
- **Status chips:** `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider` with
  semantic tints (`bg-rose-100 text-rose-700`, `bg-amber-100 text-amber-700`, `bg-emerald-100 text-emerald-700`,
  `bg-slate-100 text-slate-600`, brand `bg-[#3D52A0]/10 text-[#3D52A0]`).

## Controls

- **Input or select:** `w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50`.
- **Label:** the field-label class above, `mb-1.5`.
- **Primary button:** `px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50`.
- **Secondary button:** `px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50`.
- **Segmented choice:** `inline-flex p-1 rounded-xl bg-slate-100`. The selected option is `bg-white text-slate-800 shadow-sm`; the others are `text-slate-500`.

## Modals

Copy `AssignProjectsModal`:
- Root: `fixed inset-0 z-[300]`.
- Backdrop: `phd-scrim bg-[#12182F]/40 backdrop-blur-sm`.
- Body: `phd-pop` with `rounded-3xl border border-slate-200 shadow-2xl`.
- Header: a brand eyebrow (`text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]`) and a title.
- Footer: `bg-slate-50 border-t border-slate-100`.
- Import `components/projectHeader/projectHeader.css` in the file that uses these classes.

## Motion

Use only the motion classes that already exist; do not write new keyframes.
- Cards arrive with `hud-panel-in`.
- When a section changes, the content column gets `key={section}` and `hud-swap`.
- Rows and rail items use `hud-row-in`, staggered with `style={{ animationDelay: \`${i * 30}ms\` }}`.
- Figures count up with `CountUp`. Loading states use `Dot live` or `hud-scanning`.
- Modals use `phd-scrim` and `phd-pop`. Small hover lifts use `phd-lift`.
- Reduced motion is already handled in the CSS; do not add motion that bypasses it.

## Copy

Sentence case. Write to the person using the screen, in the studio's own words (clients, projects,
minutes, payments). Buttons say exactly what they do ("Save to the log", "Send for approval").

## People motion (approved 11 Oct 2026)

The studio owner asked for People (attendance and leave, `components/people/`)
to feel more modern and more animated than the console screens, with the
**same type and colour rules as everywhere else**. Only People uses this kit;
other screens keep the motion listed above.

- Classes live in `components/people/people.css` (import it, or import from
  `components/people/PeopleBits.tsx`, which does):
  - `pp-glass` and `pp-glow`: the glass card and its slow brand glow.
  - `Ring` (`pp-ring-*`): progress rings that fill from empty (the working
    day, leave balances).
  - `pp-live`: a breathing halo on the live dot while checked in.
  - `pp-radar`: radar rings while a location is being found.
  - `DoneTick` (`pp-burst`, `pp-tick`): the success burst and self-drawing tick.
  - `Skeleton` (`pp-shimmer`): loading placeholders.
  - `pp-lift`: the hover lift on interactive cards.
  - `pp-tickover`: the blinking colon of the live clock.
- framer-motion, already used across the app, for:
  - lists that rise in one after another (`listV`, `rowV`);
  - sections that swap in (`sectionV`);
  - the gliding segmented choice (`Glide`);
  - the rail's sliding highlight (`layoutId`).
- Everything stops under `prefers-reduced-motion`.
- Still: no new fonts, no new accent colours, no half-pixel sizes. State colours
  stay rose, amber and emerald; the brand stays `#3D52A0`.

### Round two: depth (approved 12 Oct 2026)

The owner asked for People to feel "always exciting": 3D motion, better icons,
a fresh calendar, and an animated note for admins whenever someone checks in.
Same fonts, same colours. Still People only.

- In `components/people/PeopleBits.tsx`:
  - `Tilt`: a card that tilts towards the mouse in 3D, with a soft light (still on touch);
  - `IconTile` (`pp-tile`): an icon in a tinted tile that lifts and turns on hover
    (of itself, or of a `group` around it). It replaces the flat icon chip in People panels;
  - `Coin`: flips from its back to its face (who's in);
  - `Confetti`: a short burst in the brand and state colours only;
  - `LEAVE_ICON` / `MODE_ICON`: palm (planned), thermometer (sick), coffee (casual),
    gift (comp-off), house (home); building (office), hard hat (site).
- In `people.css`: `pp-3d`, `pp-keep`, `pp-face`, `pp-flipped` (3D stage and flip faces),
  `pp-press` (a button with depth that sinks when pressed, and a passing light),
  `pp-hatch` (studio off days), `pp-today` (today's breathing ring), `pp-orbit*`
  (faces circling a tilted ring), `pp-door` (the arrival icon swinging open) and
  `pp-float` (empty-state icons).
- Where they are used: the arrivals board and notes (`Arrivals.tsx`), the calendar
  (`PeopleCalendar.tsx`: months turn like pages, days ripple in), leave balances
  that turn over for detail, tilting directory cards, and the check-in button.
- Everything still stops under `prefers-reduced-motion`.

### Home widgets (approved 12 Oct 2026)

The shelf of widgets on Home (`components/home/HomeWidgets.tsx`, rules in
`lib/homeWidgets.ts`) uses the same People motion kit: glass cards that tilt,
icon tiles, coins and flip digits, with the same fonts and colours. Widgets:
Design Desk "for you" and the review inbox, meetings and visits booked with
clients, the team today (who is away or working from home only), and the next
holiday. Each shows only for the roles that open what it shows.

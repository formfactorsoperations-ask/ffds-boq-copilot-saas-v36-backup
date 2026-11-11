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
  The top-bar tabs are the exception: see "Top tabs open the same way" below.
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

## Top tabs open the same way (approved 21 Oct 2026)

Home, Projects, Design Desk, Ops Desk, People, Clients and Reports are the tabs in the top bar, and
the owner asked that moving between them should not feel like moving between apps.

- **Title row.** The shell names the page (`PageTitleBlock`, from `components/pageMeta.ts`): the title,
  a one-line subtitle and a rule under them. Add the route to `pageMeta.ts`; never put an `h1` or a
  `ConsoleHeader` at the top of one of these tabs. A page adds a badge, figures or buttons to that row
  with `usePageHeader`, and hides it (`hidden: true`) only while it shows a full-screen view of its own,
  such as a sheet under review in Design Desk.
- **The bar under it.** `components/ui/StudioBar.tsx`, copied from Projects: a white strip on the left
  (`BarStrip`, with a small label and `BarChip` counts that take you to what they count) and the page's
  buttons on the right (`BarButton`, the main one `primary` and last).
- **Then a toolbar** where the page has filters: `pt-1 pb-3 border-b border-slate-200/50`, filters on
  the left, search or refresh on the right.
- Design Desk keeps its own colours (ink, paper and its indigo), by the owner's choice. Its layout
  follows the rules above.
- People and the Ops Desk keep their motion kits inside the bar (rings, the gliding choice, `pp-press`).

### Margins on project cards

A project card's margin is covered (two dots) until someone points at it or tabs to it; a click
keeps it showing until the next click and never opens the project
(`components/projects/MarginReveal.tsx`). The figure rolls up and comes into focus on a plain
300ms transition, and stays still under reduced motion.

### Hide figures

For a pitch or a shared screen, the top bar and the project hub's row carry a "Hide figures" switch
(`components/ui/HideFigures.tsx`, rules in `lib/figuresPrivacy.ts`, Alt+Shift+H), shown only to the
roles that see the studio's money. It is an icon button the size and shape of the bell beside it:
an open eye while figures show; when they are hidden the eye closes (the icons cross over on a plain
300ms transition, still under reduced motion), the button takes the brand tint and a brand dot. While it is on, `seesStudioFinance` answers no, so every screen hides what it
hides from a Designer, and a screen that is wholly about money is covered by one `Panel`-style card
with "Show figures". Client prices stay. New screens that show margin, cost or collections ask
`seesStudioFinance`, and so follow the switch with no extra work.

Beside it, for everyone, sits **Refresh StudioDesk** (`components/ui/RefreshApp.tsx`, `lib/appVersion.ts`),
the same icon button. It reloads the app with no cached copy. When a newer deploy is out it takes the brand
tint and dot, the same way Hide figures shows it is on. The phone menu has a "Refresh StudioDesk" row under "Storage & sync".

## People motion (approved 11 Oct 2026)

The studio owner asked for People (attendance and leave, `components/people/`)
to feel more modern and more animated than the console screens, with the
**same type and colour rules as everywhere else**. Only People uses this kit;
other screens keep the motion listed above.

- Classes live in `components/people/peopleStyles.ts`, which adds them to the page
  when first imported (import it, or import from `components/people/PeopleBits.tsx`,
  which does). There is no separate .css file to forget when syncing:
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
  - lists that rise in one after another (`listV`, `rowV`), quickly: a list of
    thirty is all in within about three quarters of a second, with no blur
    (27 Oct 2026, for speed);
  - sections that swap in (`sectionV`), at once, without waiting for the old
    section to leave;
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
- In `peopleStyles.ts`: `pp-3d`, `pp-keep`, `pp-face`, `pp-flipped` (3D stage and flip faces),
  `pp-press` (a button with depth that sinks when pressed, and a passing light),
  `pp-hatch` (studio off days), `pp-today` (today's breathing ring), `pp-orbit*`
  (faces circling a tilted ring), `pp-door` (the arrival icon swinging open) and
  `pp-float` (empty-state icons).
- Where they are used: the arrivals board and notes (`Arrivals.tsx`), the calendar
  (`PeopleCalendar.tsx`: months turn like pages, days ripple in), leave balances
  that turn over for detail, tilting directory cards, and the check-in button.
- Everything still stops under `prefers-reduced-motion`.

### Home stories (approved 12 Oct 2026)

The top of Home is the owner's chosen design (Option 6): a greeting, the
projects you were last in ("Continue where you left off": chips beside New
project, each back to the tab you left), story rings, a fanned deck of cards
and a strip of five swatches
(`components/home/StoryDeck.tsx`, rules in `lib/homeStories.ts`). It replaced
the orbit dial.

- Five materials, for Home only, in `components/home/homeStyles.ts`:
  indigo (the brand), periwinkle (the brand lightened), brass, rose and sage
  (the accents Home already used for Reports, Blocked and Clients), and navy
  (the brand darkened) for the Team ring. Nothing else.
- The greeting and big figures use the display face Home already had
  (`--font-display`). Everything else is the app's type scale.
- Each card says one true thing from StudioDesk's own data, with one button;
  money appears only for finance roles. Cards with nothing to say are left out.
- The fan is the mockup's: seven slots round a circle, the most pressing card
  in front; each step out turns 7°, shrinks and drops. Cards move on a .65s
  overshoot and a new deck rises in card by card (`hs-slot`, `hs-face`).
  Point at a card and it rises a little (so its button stays under the
  pointer) while the others part round it. Every card's button acts, side
  cards included; a tap elsewhere on a side card brings it to the middle.
- A ring turns the fan to its first card (it never hides the others); the ring
  of the card in front is lit. Fan with arrows, a swipe, the arrow keys or a
  tap on a side card. Motion stops under `prefers-reduced-motion`.

### Home widgets (approved 12 Oct 2026)

The Home widgets (`components/home/HomeWidgets.tsx`, rules in
`lib/homeWidgets.ts`) use the same People motion kit: icon tiles, coins and
flip digits, with the same fonts and colours. Widgets: Design Desk "for you"
and the review inbox, meetings and visits booked with clients, and the team
today (who is away or working from home only) with a countdown to the next
holiday. Each shows only for the roles that open what it shows.

### Ask the studio (approved 12 Oct 2026)

Under the board, a question box (`components/home/AskStudio.tsx`, record in
`lib/studioAsk.ts`): a sparkle, the question, an Ask button, and three
suggested questions for the person's view. The answer card repeats the
question, gives the answer in plain sentences and names what it read
("From: Sheets, Harmony 704"). It reads only what Home already holds for that
person, through the studio's server-side AI proxy: money only for finance
roles, a designer's own projects only.

### People: the office guide and the studio's life (approved 27 Oct 2026)

The owner approved mockups 1, B, C, E and I. They live in People, in the same
fonts, colours and People motion kit (rules in `lib/peopleGuide.ts`).

- **Office guide** (`OfficeGuide.tsx`) replaced the Directory: one table of desk,
  computer, office mobile, office email, extension, birthday and who is in today,
  or cards that turn over. Rows rise in; a name opens a contact card that slides
  in from the right with a slight turn. Copy buttons tick when used. Admins edit.
- **Office essentials** (`OfficeEssentials.tsx`): tiles for Wi-Fi, address, hours
  (from the People policy), printers, office help and emergencies (rose tile).
- **Celebrations** (`Celebrations.tsx`): a card whose cover opens in 3D, with
  wishes rising in and `Confetti` when signed; a glass banner on Today.
- **Kudos wall** (`KudosWall.tsx`): notes hang tilted from a pin and straighten
  on hover; paper in the brand and state tints only.
- **Emergency contacts** (`EmergencyContacts.tsx`): private to the person and
  admins; opening one asks why, and the person is told.
- Birth years and personal numbers are never asked for or shown.
- **Telling the studio** (owner, 3 Nov 2026: "nobody is aware until told"): a thank-you goes
  to everyone's bell, quietly (folded by day); a birthday or anniversary is told the day
  before, asks everyone else to sign on the day (a "needs you" note with Sign the card),
  and wishes the person well. Notes open their section of People (`lib/peopleSection.ts`).
- **Studio life** pin on Home (`StudioLifeWidget`): a card to sign today, tomorrow's,
  the week's thank-yous as small tilted notes, and the month's occasions. "Sign the card"
  while unsigned (a to-do), "Your day" on your own, otherwise only worth knowing; left out
  when there is nothing in it.
- **Moments** (owner, 3 Nov 2026, `lib/peopleMoments.ts`): a new thank-you, or a birthday or
  anniversary today, plays once for each person in each place, under a `ConfettiShower` (five
  bursts across the card, brand and state colours only): a glass card that drops in at the top
  of Home (`StudioMoments`), new notes on the kudos wall with a glowing "New" ring, and the
  day's card in Celebrations. Nothing moves under reduced motion; the card still shows.
- **Party on hover** (owner, 3 Nov 2026, `useHoverParty` and `Cracker` in `PeopleBits.tsx`):
  pointing at a kudos note or a birthday or anniversary card sets off confetti and crackers (a
  spark rises and bursts into a ring of streaks) one after another, at random spots on it, until
  the pointer leaves. Brand and state colours only; mouse only, so a touch does nothing; held for
  a moment while a wish is typed; nothing under reduced motion.
- **Who liked it** (owner, 3 Nov 2026, `likersOf` in `lib/peopleGuide.ts`): the faces of whoever
  hearted a kudos note sit by the heart (rose tint, yours solid, three then "+N"); pointing at them
  or the heart, or tapping the faces, opens a small list of names that pops up above. The Home
  pin's heart count says who in its tooltip.
- **Travel claims** (owner, 4 Nov 2026, `lib/peopleClaims.ts`, `TravelClaims.tsx`): "Travel" under
  My day. Logging a trip is five short steps (who it was for, where and when, what for, how, what
  it cost) under
  a trip ticket in the brand gradient that fills in as you answer: who it was for, then the route
  draws itself with "One way" (→) or "Round trip" (⇄) under it, the
  way you travelled rides along it, the amount springs in, and "Sent" stamps it with `Confetti`.
  Picking a tile moves on by itself; a recent trip repeats in one tap. The amount is typed in;
  by own bike or car "Work it out from km" fills it at the founders' rate. No trips yet shows a
  small road with each way of travelling riding along it. Founders (People admins) see "To
  approve" (by person, "Approve all", a stamp lands on each decision) and "To pay back" (by
  person, "Mark paid"), and set the rates. Status chips: waiting amber, approved emerald, paid
  back brand, not approved rose. A trip is for a project, a lead (founders and Client Relations
  pick from the list), a new enquiry not in the studio yet (by name) or the studio; a small chip
  in the project's tint says which, and Reports → Travel claims groups by person or by project.
  Deleting a trip is a bin that turns when pointed at and asks first ("Delete this trip?", a rose
  Delete and Keep); the trip then slides away. Its person deletes it until it is approved; a
  founder, anyone else's at any stage.
- **Reports** (owner, 4 Nov 2026: "make the monthly report more usable for founders",
  `PeopleReport.tsx`): one panel with Attendance, Travel claims (founders) and Leave year. Tiles
  count up; tables sort by any column and filter by name; "Worth a look" lists who was late three
  times, left a day open or has days unaccounted for; thin bars fill in; each has its own CSV.
- **Leave types shown** (owner, 4 Nov 2026: "6 CLs + 6 SLs a year, plus holidays"): People shows
  only the leave the studio gives. A type with no allowance (planned leave, by default) and none
  taken is left out of the bar, Leave, the leave form, Today and the Leave year report.
  Where the studio gives no planned leave, planned days already taken count as casual leave
  (shown as casual, "incl. N from planned" in the report). A leave day on a weekly or monthly off
  or a studio holiday, even one added later, is never charged; the Leave year report says so
  ("+N on offs, free") and lists who in a "Worth a look" strip.
- The People rail is grouped (owner, 28 Oct 2026): My day (Today, Attendance, Leave, Travel,
  Approvals), Team (Calendar, Office guide, Celebrations, Kudos), Studio (Essentials,
  Emergency contacts) and Admin (Reports). Group names are field labels, shown
  from `lg` up; a group with nothing in it for that person is left out.

### Ops Desk motion (approved 21 Oct 2026)

The owner asked for the Ops Desk to stop looking static and to work for a team
of Client Relations people, not one (mockups OD1 to OD7 and L1 to L4, approved
19 Oct 2026). It uses the People motion kit (`components/people/PeopleBits.tsx`,
`peopleStyles.ts`) with the same fonts and colours. Shared pieces are in
`components/opsDesk/DeskBits.tsx`.

- The rail is grouped (Clients, Meetings, Records, Team for the leads, Help) in a
  white card, with a highlight that slides between items (`layoutId`).
- Sections turn up into place in depth (`deskSectionV`); cards rise with
  `cardV`; lists rise row by row (`listV`, `rowV`).
- "Up next" is a glass card (`pp-glass`, `pp-glow`) that tilts to the pointer
  (`Tilt`); when it is done, it flips away and the next one flips in.
- Icon chips are `IconTile`s that turn on hover; the main button of a screen
  is `pp-press`.
- The day is a small `Ring` in the bar under the title; a ticked next step draws a `DoneTick`;
  closing the day ends with `Confetti`.
- Rows open in place (height and fade); the playbook and the client panel
  slide in from the right with a slight turn.
- The first-week guide's steps flip like coins when done (`Coin`), and "Show
  me" puts a spotlight on the real button.
- Leads: columns turn in one after another, cards tilt, and a card glides to
  its new column when its stage changes. A card can be dragged to another
  stage with a mouse, trackpad or pen: it lifts and tilts, the column under it
  lights up with "Drop here". On touch screens the stage is changed on the
  lead's page, so dragging never fights the page's scroll.
- Leads: a pipeline strip over the board (New to Won as chevrons, Lost apart)
  with counts that count up; each segment scrolls to its column and takes a
  dropped card. Columns carry a top rule in the brand colour, lighter to darker
  as the lead moves on; Won is the last column in emerald, each card with the
  project it joined (a lead is won when the client says yes, and is linked to
  its project, already open for the proposal; no project is made).
  Lost is a lane under the board. A card's left edge shows how warm it is
  (rose, amber, slate); call and WhatsApp appear on hover. Dropping on Lost
  opens the reason sheet (`phd-scrim`, `phd-pop`). The calendar turns in depth
  between months, and a next step can be dragged to another day. Insight bars
  grow from the left and counts use `CountUp`.
- A section, and a Leads view, turns in when it changes but never waits for
  the old one to leave: with framer-motion 11 and React 19 a waited exit could
  be left hanging, and the screen then stayed empty.
- Everything stops under `prefers-reduced-motion`. No new fonts, no new accent
  colours, no half-pixel sizes.

### Ops Desk 2.1 (approved 11 Nov 2026)

The owner approved the Ops Desk 2.1 mockup ("Ops Desk 2.1.1") for the whole desk, for the Ops
Director, Admins and Client Relations (the ops exec). It replaces the look above for the Ops Desk;
the motion kit above still applies. Same font (never set; `kbd` takes `font-family: inherit`),
the brand, slate, and rose/amber/emerald for state. Light only: the owner chose no dark mode.

- Styles live in `components/opsDesk/od2Styles.ts`, added to the page on first import like
  `peopleStyles.ts`. Every class is `od-` prefixed and sits under `.od2` (the desk) or `.od-ov`
  (its overlays), so nothing leaks to other tabs. Pieces are in `Od2Bits.tsx`.
- **Shell.** Under the shell's title row, a toolbar instead of the `StudioBar`: Ctrl K search,
  Actual/Dummy for the leads, Refresh, and Log a follow-up. A white rail grouped Today, Clients,
  Meetings, Records, Team (leads) and Help, with a sliding brand highlight and rose badges.
- **Bands.** Each screen opens on a light band (brand glow on white), eyebrow, title, a line and
  its buttons, with frosted stat tiles (`Tiles`) whose figures count up or fill a ring.
- **My day.** A hero with the day ring, the greeting naming how many things make the day, health
  counts and the streak of closed days (Client Relations); the client wall (a curved canvas
  carousel that drifts, drags, steps and pauses); then a bento: Up next as a stack of cards with
  what to say (D, S, F keys), focus mode full screen, today's meetings on one line with a red
  "now", client pulse tiles, payments to chase, the leads at a glance, the day in order, and
  Who's on what for the leads.
- **Clients** (new): the wall or a grid, how they feel, handovers coming, what they owe. A
  client opens a page (not a drawer): rings for progress, health and handover, the journey
  Proposal, Design, Approvals, Execution, Handover, and tabs Story, Drawings, Decisions, Payments.
- **Other screens** keep their workings and sheets: waiting cards with how long they waited,
  payments by ageing with reminder pips and "Log a promise", pulse cards with every point, the
  log as a river, escalation and minutes cards, the approval runway (fanned sheets, a five-day
  countdown ring, the stamp), calling mode for hot leads, the week above Meetings & visits.
- Statuses map onto the new screens in `lib/opsDesk2.ts` (tested); nothing new is stored.
- Amounts appear only for roles that see money (`Amt`); everyone else sees "Hidden".
- **Who sees what** (phase 2, owner's choices 11 Nov 2026): five switches for the Owner and the Ops
  Director, all off at first (site work, portal messages with amounts masked, the accepted
  proposal's name, the Drive folder, cover). The server writes only what is on into Client
  Relations' copy (`lib/opsAccess.ts`). The client page adds Site, Messages and Files tabs and
  "What they chose"; a tab that is off shows a dashed lock card saying so.
- **Cover**: a lead gives one Client Relations person another's projects until the end of a day;
  they work them fully and it ends by itself (hourly `opsCoverExpiry`).
- **Payment reminders on days 1, 7 and 14** after the due date are drafted onto Today for a
  person to send; nothing reaches a client by itself. "Log a promise" pauses them until the date.
- **Client moments** on My day: a handover a week away, a design just approved, a month and each
  year in their home, each with the message drafted. No birthdays are stored.
- **Friday digest** (owner's choices, 11 Nov 2026; `lib/fridayDigest.ts`, `FridayDigest.tsx`): one update a
  week per client in design or on site, built on that week's Weekly Pulse, else drafted from the
  records only (site updates, approvals, decisions, visits), with amounts masked and no payment
  asks. The writer sends it for approval, a lead approves or sends it back with a note, and only
  then does it go on WhatsApp (a person presses send) or by email (`sendFridayDigest`, which checks
  the approval again). Its words are fixed once approved. The screen pairs a list of clients with a
  WhatsApp-style preview beside the editable text.
- Everything stops under `prefers-reduced-motion`.

### Notifications motion (approved 22 Oct 2026)

The owner chose four of the fifteen notification patterns in the round-two
mockups (badges on the tabs, the bell's inbox, one bar for "needs you", live
changes in place), the bar in glass, with "more animations and 3D". These
appear on every screen, so their kit is allowed everywhere they appear; the
screens around them keep their own motion. Pieces are in `components/notify/`,
styles in `notifyStyles.ts` (added to the page when first imported, like
`peopleStyles.ts`), and they reuse the People kit (`IconTile`, `Tilt`,
`DoneTick`, `Glide`, `pp-press`). Who is told what is in `lib/notify.ts`.

- Only "needs you" interrupts. Plain updates are counted and listed, never shown
  as a pop-up.
- Counts: a rose number (`nt-count`, with a breathing halo) when someone is
  waiting on you; a brand dot (`nt-dot`) when there is only something new to
  read. A count turns over in 3D when it changes (`nt-flip`). It changes the
  moment a note lands and never waits for an animation.
- The bell is the brushed-metal bell of the project hub; one 3D swing when a
  note lands (`nt-ring`). There is one bell on any screen: inside a project, what
  that project is waiting on (`useHubAlerts`, which used to be a second bell
  beside it) is the bell's first section, "On this project", and counts on it. Its list opens like a card folding down, rows turn in
  one after another, a burst of check-ins folds into one row of faces.
- The "needs you" bar is frosted glass (`nt-glass`, with `nt-orb` glows and a
  passing `nt-sheen`), rises from below in 3D, tilts to the pointer (`Tilt`),
  and turns over when a newer note replaces it. One at a time; it never takes
  the keyboard or covers the middle of the page.
- Live in place: a chip that turns in beside the page title (`LiveStamp`), glows
  once (`nt-live`) and leaves on its own.
- "What reaches you" (`NotifySettings`, opened from the bell) is a modal on the
  `AssignProjectsModal` pattern: sections in bordered cards with `IconTile`s that
  rise in with `hud-row-in`, switches in the brand colour, `Glide` for quiet hours
  and check-ins, and a footer that says it saved. No Save button.
- "Waiting on you" on the Ops Desk (`WaitingOnYou`) is a desk `Panel`; rows turn in
  like the bell's, and each timer is a chip: slate, amber from 10 minutes, rose
  from 30.
- Desktop alerts, the dot on the tab's icon and the chime (`notifyChannels.ts`)
  never ask for permission on their own; the browser asks from "What reaches you"
  or the one-time offer in the bell.
- Phone notifications (`notifyPush.ts`) are one more section and one more switch
  column in "What reaches you", turned on per device. When a device cannot turn
  them on yet (an iPhone not on the Home Screen, no Web Push key), the section
  says what to do in its blurb and shows no switch.
- The catch-up after time away (`CatchUp`) is the bar's glass as a centred card on
  the modal scrim: it rises in 3D, the counts by kind turn in with `hud-row-in`,
  and the notes waiting on you are dealt one at a time, each turning over sideways
  into the next, with brand dots for the steps.
- In the client portal the same bell sits in the header before the account menu.
  A client's settings window has only alerts and phone; the rest of the kit is the
  same.
- Same fonts and colours as everywhere: brand, slate, rose/amber/emerald for
  state. Everything stops under `prefers-reduced-motion`.

### Times

Times people read are on the 12-hour clock ("9:42 AM"), through `clock12` in
`lib/peopleDesk.ts`. `timeLabel` stays 24-hour for comparing, exporting and
importing. The top of Home opens on one chip with the date and the studio's
time ("Mon, 12 Oct | 11:52 PM", `DateClock` in `StoryDeck.tsx`): the time is a
small flip clock whose navy tiles fold over when a digit changes, with a
pulsing colon; the chip leans toward the mouse (`Tilt`). Motion stops under
`prefers-reduced-motion`.

### Your day, in order (approved 12 Oct 2026)

Home pins the widgets to a sheet of ruled paper along a dashed path
(`components/home/DayBoard.tsx`, order in `lib/homeDay.ts`), the one that saves
the most time first: a meeting today, then late or blocking work, then work
ready to go, then what is only worth knowing. Nothing of the day sits below
the board.

- My day (check in and out) is always pin 01: "Start here" until the person is
  in, then "In since 9:42", "Day done" or "Day off".
- "Needs your attention" (the studio's worklist, `useAttention.ts`) is a pin:
  the top three projects blocked or due, with snooze and dismiss, and the rest
  a tap away.
- "Coming up" opens with the week ahead: a cell a day, a rose dot for each
  client meeting and a brass one for a project milestone (handover, BOQ
  freeze, signup, possession), the milestones named under it.
- The old clock-and-calendar strip, studio pulse, attention panel and recent
  projects rail are gone: the date is in the greeting and the pulse figures
  are in the swatches.

- Each pin is numbered (01, 02…) in the display face and says in a word why it
  sits there ("Today", "Overdue", "Ready to send"). The heading counts the
  pins that are something to do.
- Pin colours run brass, indigo, rose, sage, periwinkle, navy in order,
  lightened for paper.
- Two staggered columns from 1024px, one column below. Pins hang slightly
  tilted from the pin, straighten on hover, drop in one after another, and the
  path's dashes walk (`hs-paper`, `hs-march` in `homeStyles.ts`). All of it
  stops under `prefers-reduced-motion`.

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

## Screen kit (owner, 16 Nov 2026)

The parts above are components in `components/ui/kit.tsx`. Build screens from them rather than
copying their classes:

- `Panel` (and `PanelHead` for a card with motion of its own): the content card, its icon chip,
  title, blurb, `badge` after the title, `aside` on the right and an optional `foot` strip.
- `Button` (`primary`, `secondary`, `quiet`, `danger`; `sm`), or `buttonClass()` for a link.
- `Chip` and `StateDot` (tones `brand`, `slate`, `good`, `warn`, `bad`): state lives here, never in a
  tinted tile or a coloured button.
- `Segmented` for a view switch; `Toolbar` for filters and search; `LABEL` and `INPUT` for fields.
- `SummaryStrip` / `StatTile`: three to five white figure tiles above the work, a `StateDot` for state.
- `EmptyState`: an icon chip, a title, one line and at most one button, sized to its words.

People, the Ops Desk and Pricing keep their approved motion by passing their own tile as `chip`.

`src/tests/designGuard.test.ts` counts half-pixel sizes, 6–9px text, colours outside the palette
and fonts of their own in every app file. A file may only go down from the counts recorded on
16 Nov 2026 (`designGuard.baseline.json`), and a new file starts at zero. After cleaning a file up,
run `UPDATE_DESIGN_BASELINE=1 npx vitest run src/tests/designGuard.test.ts`. Design Desk
(`components/drawingReview`) keeps its own colours. Design Desk 2.0 (`components/designDesk2`) has
its own section below.

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

## Design Desk 2.0 (mockup approved 24 Nov 2026)

The owner approved a new look for the Design Desk (`components/designDesk2`), from the mockup
"Design Desk, the easy flow". Designers are its main users, so it is plainer and larger than the
console screens. It is built in phases behind a studio switch (the studio's `designDesk` field,
read by `DesignDeskSwitch`); today's desk (`components/drawingReview`) stays until each phase is
accepted. The switch is one row in Studio settings > Data & integrations
(`components/studio/DesignDeskSetting.tsx`, the kit's `Segmented`), saved with the rest of the
settings draft. Neither desk draws a switch or a way back: people at work see one desk.

What the new desk may do that a console screen may not:
- **A dark green rail** (`components/designDesk2/rail.tsx`, `#0C1F1A`) with Home, All drawings and
  Meetings. The active item is `bg-emerald-600 text-white hud-rail-active`; the others are
  `text-emerald-100`. On a wide screen it is a full-height side panel that stays in view while the
  page scrolls, and under the three pages it carries, in this order: a ring with how many of the
  drawings are approved, three small counts (Need you, Being checked, Being changed), "Projects with
  drawings" (one click opens a project; the open one is `bg-white/15`), a line-drawn plan in what
  room is left, and Upload drawings for someone who uploads. On a phone it is a row of tabs above the
  page and the rest is left out. **Do not use CSS `sticky` for it:** the app's root has
  `overflow-x: hidden`, so nothing sticks to the window; `useRailFollow` pins it instead.
- **Home's project list** (`ProjectList.tsx`) is one list, a line per project that has drawings, in
  fixed columns: mark, name and client, "n of m approved" with a bar, one tag (amber "n need you",
  emerald "All approved" or slate "Nothing for you"), an arrow. Projects with no drawing are folded
  under one line ("14 projects with no drawings yet") and open as small tiles. From nine projects up
  there is a "Find a project" box. Do not go back to a grid of equal cards.
- **Emerald for the main action** (`bg-emerald-600`, hover `emerald-700`) and for done steps, in
  place of the brand blue. **Amber for "your turn" and the client.** Rose for late. Slate for the
  rest. No other colours.
- **Larger controls and type:** buttons are 44px tall (48px for the one in "Start here"), names are
  `text-base font-bold`, the sentence under a name is `text-sm text-slate-700`.
- **The welcome band** on Home: a `from-[#0C1F1A] to-emerald-900` gradient with "Start here" inside.
- **Its own parts** (`components/designDesk2/parts.tsx`: `Btn`, `Card`, `Tag`, `StepTrack`,
  `Empty`) instead of the screen kit, because of the size and the colour.

Room messages (`components/roomMessages`) are one thread in two looks. Beside a room's drawings on
the new desk, `RoomThread` takes the desk's emerald (`tone="desk"`). In a project's Drawings tab the
"Room messages" button is the kit's `Button`, and its panel follows the modal rules above with the
brand blue (`tone="console"`), because that screen is a console screen.

What stays as everywhere else:
- The fonts. The mockup's fonts were not adopted (owner, 24 Nov 2026): the desk uses the app's own.
- The motion classes on its pages: `hud-panel-in`, `hud-row-in`, `hud-swap`, `hud-rail-active`,
  `phd-lift`, plus the desk's own `dd2h-*` set (see "Design Desk 2.0 pages in motion" below). The
  drawing screen has more: see "Design Desk 2.0 motion" below.
- The guard: `designGuard.test.ts` counts the new folder like any other, and it is at zero.
- The words: a drawing's place is one plain sentence (`lib/designDesk2.ts`, `whereLine`), its steps
  are numbered (`stepsOf`), and it shows one main button (`mainAction`).

### Words: approve and sign off (Design Head and co-owner, 25 Nov 2026)

**The studio approves a drawing. The client signs it off.** With "approved by the studio" and
"approved by the client" on the same screens, nobody could tell which of the two a drawing had. On
every screen where staff follow a drawing (both Design Desks, Ops Desk → Drawings for sign-off, a
project's Drawings tab, the design gate, and the lines the server writes into a drawing's history):

- **Approve, approved, approval** are the Design Head's (or the studio's) only: "Approve v2",
  "Approved by the studio", "Keep it approved", "3 of 15 approved".
- **Sign off, signed off, sign-off** are the client's only: the step "Client signs off", "Signed off
  by the client", "Send for sign-off", "the sign-off email", "Sign-off overdue", "Take as signed
  off", "Record sign-off", "written sign-off".
- Never "approved by the client", "client approval", "approval email", and never "signed off" for
  the Design Head. `src/tests/signOffWords.test.ts` holds this.
- In a project's Drawings tab a drawing that is final shows **Signed off**, or **Approved · studio
  only** when it never goes to the client; one the Design Head has approved and the client has not
  seen shows **Approved · ready for client**.
- Names in the code and in stored data keep the old word (`approvedAt`, `approval.status`,
  `ClientApproval`, the status key `'Approved'`): only what people read changed.
- What the client reads is not covered: the studio's own email to the client keeps its wording
  ("Drawings for approval", reply "Approved" to confirm your formal sign-off), and the portal says
  "confirm". Change those only when the owner asks.

### Design Desk 2.0 pages in motion (owner, 25 Nov 2026)

The owner asked for animation on the desk's pages. It lives in `HomeMotionStyles`
(`components/designDesk2/motion.tsx`, classes `dd2h-*`), mounted once by the desk, and is for the
desk only. Same fonts; emerald, amber and slate.

- **The welcome band** (`dd2h-band`): two slow lights drift behind it. The drawing in "Start here"
  floats (`dd2h-thumb`); its button's arrow leans forward and a light passes over it (`dd2h-go`).
- **The numbered steps**: the done line draws itself (`dd2h-line`), each done step pops in
  (`dd2h-step`), and the current step beats amber when it is the person's turn (`dd2h-now`).
- **A row** (`dd2h-row`): under the pointer the drawing lifts and tips, the project's mark tips, and
  the arrow slides. A project's approved bar fills from empty (`dd2h-bar`).
- **The rail**: the ring draws to its value, the counts use `CountUp`, the Home count pops
  (`dd2h-pop`), a project slides under the pointer (`dd2h-proj`), and the plan at the bottom draws
  itself wall by wall once (`dd2h-plan`), only when there is room for it.
- **Sections below the fold** rise the first time they are scrolled to (`Reveal`); a section already
  on screen, or a browser that cannot tell, just shows it.
- Everything stops under `prefers-reduced-motion`, and nothing is hidden waiting for an animation.

### Design Desk 2.0 meetings (Phase 2, from the same approved mockup)

The Meetings page (`MeetingsPage.tsx`) is a desk page like Home: `Card`, `SectionTitle`, `Btn`,
`Tag`, three numbered steps in emerald discs, and the resume band in the welcome band's gradient.

The meeting screen (`MeetingScreen.tsx`) is the one **dark** screen of the desk, as in the mockup:
it covers the app (`fixed inset-0 z-[110]`, under the dialogs and toasts at 120) so the drawing is
the brightest thing in the room or on a shared screen.
- Background `bg-slate-950`, panels `bg-slate-900`, rows and quiet buttons `bg-slate-800`, text
  `slate-100` to `slate-400`. Only slate, with the desk's three meanings on top: **emerald** the
  client is happy, **amber** a change the client asked for, **rose** the clock and Finish.
- The bar at the bottom holds the three things a room ends with, 48px tall: Add a change (amber),
  Client is happy with this room (emerald), Finish the meeting (rose).
- The change box, the finishing page and "Meeting saved" are light, in the desk's own parts.
- **Motion and depth** (owner, 24 Nov 2026, after trying it: "no animations on the page, it is too
  flat"). The drawing screen's Living icons language, on the dark screen
  (`MeetMotionStyles` in `components/designDesk2/motion.tsx`, classes `dd2m-*`):
  - the three buttons a room ends with are **raised keys** (`dd2m-key amber|emerald|rose`): a lit
    top edge, a darker base under them, they lift under the pointer and press down on a click, and
    their icons act (the pin drops, the tick draws itself, the receiver rocks). The pin keeps
    dropping while a change is being placed;
  - panels (`dd2m-panel`) have a lit top edge and a shadow, and rise in one after another; the
    background has two slow glows, emerald and amber (`dd2m-bg`);
  - the room being shown has a green bar and glow, a room's disc pops when it is decided, the open
    tab is raised, the page of the drawing rises in when it changes;
  - **the client's changes are living pins** on the drawing (the drawing screen's `dd2-pin`, in
    amber): they pop in and ripple, and hovering one springs the client's words out beside it and
    lights its card in the list;
  - deciding a room shows the drawing screen's big tick (the client is happy) or the number of
    changes in an amber disc (`dd2m-stamp`) before the next room opens;
  - a new minute lands with a green flash; the round chip glows once a room's rounds are used; the
    client window card pulses amber until the window is open.
  Same fonts, same four colours. Everything stops under reduced motion.

What the client is shown has not changed: the client's window is today's `ClientView`
(`components/drawingReview/MeetingMode.tsx`), reused as it is. The dialogs the meeting shares with
today's desk (sign, who presents, room marks, the approval email) keep their layout and take the
desk's emerald through `--dd-accent` (`DESK_ACCENT` in `meetingBits.tsx`); on today's desk they are
indigo as before.

### Design Desk 2.0 smart features (Phase 3A)

The smart features that need no AI are desk parts like the rest (`components/designDesk2/smart.tsx`,
`measure.tsx`), in the desk's colours:
- **Worth knowing** on Home: `Card` rows with a 44px tinted tile, a bold line and one sentence,
  and at most one `Btn`. Rose for a site date at risk, amber for money and for a missing drawing.
  `phd-lift` on hover, `hud-panel-in` one after another.
- **Site date**: a rose `Tag` with the hard-hat icon on a drawing's row only when the date is at
  risk (amber when the drawing is approved and only needs sending); on the drawing screen one line
  under "Where it is now", rose, amber or slate.
- **Nudge**: a quiet `Btn` with the bell on a row, a plain one on the drawing screen. After it is
  pressed it reads "Reminded" with a tick. Nothing is reminded by itself and nothing goes to
  WhatsApp (owner, 24 Nov 2026: held back for now).
- **Measure**: its key joins the drawing screen's tool bar with a ruler that slides under the
  pointer (`LiveIcon tool="measure"`). Lines and their labels on the drawing are the brand blue
  `#3D52A0`, so they cannot be taken for notes (rose) or the client's changes (amber). The strip
  above the tool bar is white with `hud-panel-in`.
- **What the AI says is always marked as the AI's** (`components/designDesk2/ai.tsx`). The named
  changes are an amber card under "Where it is now" with a sparkle icon and "Named by AI"; a hint
  beside a note is a small chip that starts "AI:" (emerald for looks fixed, rose for looks the
  same, nothing when it cannot tell); a repeat mistake is a rose card with "Found by AI". They sit
  beside the Design Head's own buttons and never replace one.
- The tool bar stays one row from 1280px: tool names show only on the tool in hand below 1800px,
  and Compare, Changes and Measure are icons until they are in use.

### Design Desk 2.0 motion: Living icons (chosen 24 Nov 2026)

The owner asked for animation on the drawing screen's tools, notes and review panel, was shown four
live options (Clay, Keycaps, Living icons, Glow dock) and chose **Living icons**. It lives in
`components/designDesk2/motion.tsx` and is for the drawing screen only. Same fonts; the colours are
the desk's own (rose notes, emerald done, amber client and changes, slate, the brand blue).

- **Every tool's icon acts out what the tool does** (`LiveIcon`, `dd2-key`, `dd2-ico`): Select
  clicks, the pin drops, the box draws its outline, the arrow shoots, the pen writes, Compare slides,
  Changes twinkles. An icon sits in a soft round tile of its own colour, which fills when it is
  under the pointer or in hand. It moves again and again under the pointer, and once when it is
  picked. The first time a drawing is opened in a visit, each icon acts once in turn. The icons are
  drawn in `motion.tsx`, because a stock icon's parts cannot move on their own.
- **Pins** (`dd2-pin`): a note's number pops in. An open note sends out ripples; a fixed one is still.
  It grows under the pointer.
- **The note on hover** (`dd2-bubble`, `dd2-lead`): springs out of its pin on a moving dotted line.
- **Pin and card together:** hovering a pin lights its card in the list; hovering a card grows its pin.
- **Note cards** (`Tilt`, `dd2-note`): lean a little, grow a coloured edge and bounce their number.
- **Approve** (`dd2-go`, `dd2-tick`): a big tick draws itself over the drawing before the next one
  opens. "Your turn" has a breathing dot (`dd2-dot`).
- Everything stops under `prefers-reduced-motion`, and nothing tilts on touch.

### Playground library motion (approved 20 Nov 2026)

The owner asked for the BOQ Playground's design library (`components/playground/Catalogue.tsx`,
`KitParts.tsx`, `SupplyParts.tsx`) to feel fluid, with the mockup's hover motion:
- Tiles and cards lift with `phd-lift` and take `hover:shadow-md` and a brand border; a click presses
  them in (`active:scale-[0.98]`); a tile being dragged fades to half and shrinks a little.
- A piece's picture gives the mockup's small wiggle on hover (−7° to 7°, 420 ms), with framer-motion
  (`LibTile`), not a new keyframe. A kit's icon tips and grows a little on hover (a transition).
- Add and Apply buttons grow a little on hover and press in on click.
- Tabs change with `hud-swap`; tiles arrive with `hud-row-in`, staggered.
- Everything stops under `prefers-reduced-motion` (`useReducedMotion`, `motion-safe:`, `phd-lift`'s own rule).

## BOQ Playground (approved mockup v14, recorded 20 Nov 2026)

The BOQ Editor's one screen (`components/playground/`), built to the approved mockup. Read this before
changing any part of it; new Playground parts follow the same rules. It is every studio's BOQ Editor:
the four old modes (Focus Editor, Excel, Cards, Plan Takeoff) and the studio's switch are gone (PR 7b).
Their actions live on in the lenses; the Excel view's grid stays as the Sheet's **full grid** (statuses,
linkage, notes, change orders on a frozen BOQ). Do not add a mode or a switch back.

### The screen

- **The bar** (white, `rounded-2xl border-slate-200 shadow-sm`): the BOQ Playground mark (a brand
  tile with a white pen), the version chip and its menu, the lens switch, the library toggle, search,
  Undo, Save and the Export menu.
- **Edit all N** (`AllOptionsParts.tsx`, a `role="switch"`), right after the option's name while the
  project has more than one option: a brand-outlined button with the options drawn as a stack of cards
  and a small switch. On, it fills brand and reads "Editing all N", the cards fan out, and the whole bar
  takes a brand border and ring for as long as it stays on. What is added, deleted, moved or resized
  goes into every option, each at its own grade (lib/playground/allOptions); finish, rate and margin stay
  in the option edited; a sent or signed option is left as it is. The first time, a white tip under it
  (`phd-pop`, an arrow to the button) says what it does, with Turn it on and Got it; it does not come
  back. While the button shows, the bar's longer labels (Add items, Save changes, Import Excel) wait for
  1800px, so the bar stays on one row at 1600px.
- **Five lenses** in one `Segmented` (`label="Lens"`): **Plan**, **Rooms**, **Sheet**, **Tune**, **Deal**.
  A lens change swaps the work area with `key={lens}` and `hud-swap`. A Classic BOQ opens on the Sheet.
- **The library** floats over the stage's left edge (232px): Pieces, Kits and By client tabs, each a
  `Segmented`. It slides in with `pg-slide`.
- **A custom item** (`CustomItemModal.tsx`, the Modals pattern): a dashed brand tile, "Add a custom item ·
  Not in the Item Bank", at the top of the library's Pieces and Works, the same offer when a filter finds
  nothing ("Add “…” as a custom item"), and a link in the Sheet's footer. The studio's finance roles
  give cost and margin; everyone else gives the client's rate. It is kept with the project (`adHocItems`).
  From Works it is a **custom work**: by area or length, its quantity is measured from the room (Quantity:
  Measure from the room | Type it; Measure: the floor, the walls to the ceiling or to 7′, the ceiling,
  round the walls), with the sum shown, as the Works tab measures the bank's own.
- **A room renamed in the Brief** is renamed once the name is done (leaving the field or Enter; Escape
  goes back), and the BOQ follows: its lines, a whole-flat line's share and an offer off the room, in
  every option but the signed one. A name that is empty, a scope's or another room's is not taken; the
  field says why in rose `text-[11px]`. Lines left under a name the Brief no longer has show in Rooms
  as a card reading "Not a room in the Brief now", with **Move to** a room in place of Add.
- **A line's room and supply** sit together in its panel (`LineWhere` in `LiveBoq.tsx`): Room, a select
  (a piece on the plan comes off it when it moves; a whole-flat or civil line stays), and Supplied, a
  kit Segmented: In the price | At actuals | By client, with one line saying what that means. The
  Sheet's picked bar has the same three as buttons and **Move to…**; a line is dragged to another room
  by its grip (`GripVertical`, picked lines go together), the room under it ringed in brand, and every
  room shows while it is dragged so an empty one takes it too.
- **The right rail** is the Live BOQ (a receipt, room by room, with the work total) until a line or a
  room is picked; then the inspector for it. Each inspector is keyed by what it shows and swaps in with
  `hud-swap`. The rail hides to a "Live BOQ" button on narrow screens.
- **Over the plan**: the client's figure in a white glass card at the top right (the margin ring
  beside it for the studio's finance roles), the zoom controls centred at the foot, notes as a dark
  toast above them.
- **Menus** under the bar are `rounded-2xl bg-white border-slate-200 shadow-2xl p-1.5 hud-panel-in`;
  **modals** (sketch, quick build, kits, the plan, revision issue, import) follow "Modals" above.
- **Classic BOQs** open with a white banner (`hud-panel-in`) that says so and offers Make a Playground
  version; a signed, superseded or sent version shows why it is read-only in the same way.

### Surfaces and type

- Built from the kit: `Button`, `Chip`, `Segmented`, `EmptyState`, `LABEL`, `INPUT`. The scale and
  palette are the app's. The guard keeps `components/playground/` and `components/materialSpecs/`
  at zero (`designGuard.test.ts`, "keeps the BOQ Playground at zero"): no half-pixel or 6–9px text,
  no Tailwind colour outside the palette, no font of their own.
- Figures are `font-black tabular-nums`; money is written as `₹13,28,700`, and `₹1.32 L` where a
  tag is small (the plan's room tags).
- Margins colour against the studio's floor: rose under it, amber within five points, emerald above.
- Cost, markup, margin and Tune follow `seesStudioFinance` and Hide figures. A client page never
  shows them.

### The drawing

- The plan is SVG, drawn to scale: a dotted ground, the rooms on paper (`#f7f6f2`), walls in near-black,
  each room tinted brand by its share of the price, its name and price on a tag.
- **A plan read off the client's drawing is a line plan** (`components/playground/linePlan.tsx`, owner,
  20 Nov 2026), drawn like the mockup's: a builder's plan often comes rendered with furniture and flooring,
  so it is not drawn under the BOQ's pieces. The rooms are made into a clean plan first
  (`lib/playground/planFromDrawing.ts`): the AI's rough boxes snapped onto the walls found in the drawing
  (`lib/playground/walls.ts`), tidied so rooms share walls, a passage grown to the rooms it reaches.
  Drawn as the mockup draws a plan: inside walls solid near-black, 4½″; the outside wall about twice that,
  cross-hatched. Doors are a gap with the leaf open into the room and a thin solid quarter-circle swing;
  windows a white pane across the wall with three thin lines. Each door's width is printed inside its swing
  and each window's outside the wall (`D 3'-0"`, `W 4'-6"`, to the nearest 3″). Each room prints its name
  in capitals (slate-700, bold) and its size under it (slate-500, `13'-0" X 14'-0"`, the client's printed
  size where the plan gave one), just above its price tag, over the furniture with a paper edge; an empty
  room has no tag on the line plan and is named by the plan alone (PASSAGE, DRESS). A title block sits
  under the plan's right corner: the project, configuration and city, then LAYOUT PLAN and the area.
  The Plan lens's **Line plan / Drawing** switch shows the drawing under the rooms, to check them; the line plan is the
  default, and the meeting view always draws the line plan.
- **Only inside the drawing**, as SVG fills, the materials have their own colours: wood grains, stone,
  fabric and paint shades (`pieceArt.tsx`), and the Civil layer's marks (break rose, build slate,
  re-floor amber, wall tiles brand, waterproofing `#0284c7`). Nothing outside the drawing uses them.
- Pieces are seen from above, with their finish and a soft shadow; high pieces (lofts, wall units)
  are drawn faint, with a dashed outline and no shadow.
  The Civil layer fades the furniture to 22% and draws its own work over the rooms.

### Client pages

- The first-proposal PDF, the meeting view and the Client Proposal panel use the same type and
  palette. The PDF's sheets are A4 (794px wide on screen), white, with a quiet footer and the page number; they open over
  the whole page (`createPortal` to `document.body`) so no ancestor's print rule can blank them.
- **The drawing gate:** no client page, PDF or portal copy draws the plan with pieces until Space
  Planning is approved. The PDF shows the builder's plan as the client gave it.

### BOQ Playground motion (approved with the mockup)

The mockup's motion, in `components/playground/playground.css` (imported by `src/index.css` too, so the
deploy build keeps it), with the mockup's timings. On top of the app's classes (`hud-panel-in`, `hud-swap`,
`hud-row-in`, `phd-scrim`, `phd-pop`, `phd-lift`) and "Playground library motion" above:
- **`pg-slide`** (320 ms): a drawer from the right comes in 24px and fades up. The library, the
  Item bank's recipe drawer, the "Edit BOQ" slide-over and a material's panel in Material specs.
- **`pg-drop`** (600 ms, a small overshoot): a piece put on the plan settles into place. A kit's
  pieces drop one after another, 110 ms apart.
- **`pg-glow`** (1.1 s): the room a piece landed in, or was moved into, glows brand once.
- **`pg-tag`** (1.5 s): one piece added, resized or given another finish floats what it did to the
  price up from the piece: `+₹12,400` on emerald, `−₹3,000` on rose. Nothing under a rupee, nothing
  for a move or a turn, and nothing for a kit.
- **`pg-print`** (1.4 s): a new line prints into the Live BOQ, the Sheet and the Rooms: it drops 8px
  into place on a brand tint that fades.
- **`pg-ripple`** (700 ms): "Edit all N" turned on sends one brand ring out from the button, as its
  cards fan out (a 420 ms spring on each card) and its switch slides across.
- **`pg-beckon`** (1.6 s, three times): while the first-time tip shows, the button gives three soft
  brand rings, then stops.
- What an edit shows is worked out from the BOQ before and after it (`lib/playground/motion.ts`).
  Undo shows nothing.
- Under `prefers-reduced-motion` all seven stop and the cards do not fan; the glow is not shown, and
  the price tag stands still above the piece until it goes.

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
300ms transition, still under reduced motion), the button takes the brand tint and a brand dot.

It hides **margins only** (changed 19 Nov 2026 at the owner's request): margin and profit, and the
cost and buy rates they are worked out from. Prices, payment plans, project values and collections
stay, so a screen shared in a pitch still works. While it is on, `seesMargins` (lib/roleAccess)
answers no; `seesStudioFinance` does not change.

- A margin figure turns to dots in its own type (`Masked`), so nothing moves.
- A panel made of nothing but margin or cost shows `MarginsHidden` (the kit's `EmptyState`, with
  "Show") in place of its contents: Project Reports' Margin, Cost and Margin by room.
- Tools that only work on margins leave their menus: Tune margin, the Margin view in Pricing &
  Tiers, the Margin optimizer, the Cost & margin tab on the Hub.
- Only the two studio screens made of margins end to end, Reports and the item bank
  (`MARGIN_SCREENS`), are covered whole by one `Panel`-style card with "Show figures". Project
  screens are never covered.

New screens that show margin, cost or profit ask `seesMargins` (or `useSeesMargins`, which redraws on
the switch); screens that show values or collections ask `seesStudioFinance`.

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

### Studio stories (approved 26 Nov 2026)

The owner said kudos and birthdays on Home were "not visible at all", and chose stories like
Facebook's, each one a collectible card, in the softer of two mockups ("colours are too bold").
Rules in `lib/studioStories.ts`; the screens in `components/home/stories/`.

- **Where:** a row right under the greeting in the welcome card, above "Continue where you left
  off" and the project rings. Left out when there is nothing in it.
- **What is a story:** every thank-you on the kudos wall (the last 62 days), and a birthday or
  work anniversary for its day. A thank-you is new for 24 hours from when it was given; older
  ones stay in the row already counted as watched (grey ring, never opening by themselves), so
  they can be watched again (owner, 26 Nov 2026: "put existing kudos in the stories"). Grouped
  by the person it is about, their newest ten thank-yous, so two thank-yous for one person are
  one story with two bars.
- **The row:** "Give kudos" first, then tall tiles in the day pins' paper tints (indigo
  `#ECEFFB`/`#3D52A0` for a thank-you, sage `#E7F5EF`/`#0E7C5A` for a birthday, brass
  `#FBF5EA`/`#8C6A33` for an anniversary) on white. Each holds a small collectible card, turned a
  little, and the person's face in a ring that turns (brand to periwinkle) until watched, then
  grey. Yours first, then the ones not yet watched, then the rest. "N new" in a brand chip.
- **The viewer:** full screen over a frosted pale scrim (`#F4F6FB` at 85%, blurred), a 9:16
  frame in the story's tint (the whole screen on a phone). Bars fill as each story plays (6.5 s)
  and move on; tap the right or left third for the next or previous, hold to pause, the pause
  button, arrows and arrow keys; the next and previous person wait dimmed at either side from
  1024px. The card deals in under `Confetti`, tilts towards the pointer (sways a little when it is
  away), its foil and glare follow the light, and a tap turns it over to the note or the wishes.
  An anniversary counts its years up. Hearts float up from the heart button.
- **What you can do:** heart a thank-you (`heart`), sign a birthday or anniversary card (`wish`),
  or open the kudos wall or the card in People. Your own card says "Open your card".
- **Seen:** a story counts as watched only once it has been on screen, kept against the
  person's login (`peopleGuideCommand` `seen`, `peopleDesk/{studio}/seen/{personId}`) and in the
  browser, so no device shows it again. One about you opens full screen by itself the first time
  you come to Home.
- Motion lives in `components/home/stories/storyStyles.ts` (`ss-*`), Home's only, and stops
  under `prefers-reduced-motion` (the card stays still, nothing floats, the stories still play).
  Same fonts; colours are the day pins' tints, the brand, slate and the state colours.

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
  bursts across the card, brand and state colours only): new notes on the kudos wall with a
  glowing "New" ring, and the day's card in Celebrations. Nothing moves under reduced motion;
  the card still shows. On Home they are stories now (26 Nov 2026): see "Studio stories". The
  glass card that dropped in at the top of Home for eight seconds (`StudioMoments`) is gone.
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

### People: the lamp (asked for 18 Nov 2026, round two the same day)

On People, Check in and Check out on the My day card open the lamp
(`components/people/LampCheckIn.tsx`) instead of acting at once. So do the same
buttons on Home's My day pin (owner, 18 Nov 2026). The Site Supervisor's app
still checks in straight from the card.

- The studio in the dark (the scrim's navy, `#12182F`), with nothing that says
  night (owner, 18 Nov 2026: no moon or window, it reads wrong at the start of
  the day): a shelf of books and a vase, a mood board of swatches and a sketch,
  a desk with a closed laptop and a mug, and a plant, all nearly lost in the
  dark; and a floor lamp drawn in SVG: pleated slate cloth, amber brass.
- The cord is a bead chain with a brass bead that glows and sways a little,
  asking to be pulled. Drag it down and let go, or press it (it is a button,
  and takes focus when the window opens). The chain swings after the pull and
  the lamp head nods and wobbles back on a spring.
- The light comes on with a short flicker and a warm wash over the room: the
  shade glows from inside with the bulb seen under it, a feathered cone and a
  bright core fall to a pool on the floor, the wall warms, the studio comes out
  of the dark (the plant rim-lit, steam rising from the mug when the day is
  starting), and dust drifts up through the light, which breathes gently. All of it amber, the state colour; nothing new.
- Then the card swings in beside the lamp in 3D, its near edge catching the
  warm light: the People glass (`pp-glass`) with the modal eyebrow, "Good
  morning, Anish. / The light's on for you." in the page-title size (the second
  line in brand), where you are working (`Glide`), the site, the location note
  and "Start my day", its lines rising in one after another. The end-of-day
  card shows in at, worked and where, the daily work update link, "End my day"
  and "Keep working".
- Ending the day is the other way round (owner, 18 Nov 2026): the light put on
  in the morning is still on and the card is already there. Pulling the cord
  ("Pull to switch off") turns the light off, and that checks you out; "End my
  day" on the card does the same. The shade keeps a slow afterglow. If the
  check-out does not go through, the light comes back on with the reason.
- Done: the success tick and confetti, then the window closes.
- Framer-motion only, no new keyframes. Under `prefers-reduced-motion` nothing
  sways or flickers: the light is already on and the card already there.
- It opens by itself once a day to start the day (owner, 18 Nov 2026): the first
  time Home or People shows someone who has not checked in, on a working day
  (not a holiday, an off day or a whole day away; working from home counts),
  before the studio's day ends. Closing it counts, so it does not come back
  that day. Check-out only opens from its button.
- To try it without checking in or out, open Home or People with `?try-lamp=in` or
  `?try-lamp=out` in the address: the same window, an amber "Practice" chip on
  the card, and nothing saved.
- A day left open whose correction is waiting on the approver no longer blocks
  checking in (`lib/peopleDesk.ts`, 18 Nov 2026): the card and the lamp say the
  correction is waiting, in an amber note, and offer Check in as usual.

### People: the lanyard rail (asked for 20 Nov 2026)

The owner asked for the team to hang as ID badges on a rail, with check-in and
check-out times. "Who's in today" on People → Today (approvers only, as before)
opens on it (`components/ui/team-lanyard-rail.tsx`, badges from `lanyardsFor` in
`components/people/Arrivals.tsx`); a `Glide` switch beside the chips, "Lanyards" /
"Faces", goes back to the orbit and coins, and the choice is remembered on that device.

- A steel rail, a woven strap, a reel and a clip per person; the badge hangs from it.
  Point at a badge and it turns to face you and lifts; click it or press Enter and it
  turns over; Esc turns it back; the arrow keys walk the rail. Dragging along the rail
  jostles the badges, pulling one down stretches its cord and it springs back. When the
  badges do not fit (more people, a laptop, a phone) the rail becomes a carousel with dots
  and a swipe. With nobody touching it, it turns each badge over in turn until the first
  touch.
- Colour says how the day started, in the state colours only: emerald in on time, amber
  late, brand working from home, slate not in yet or away. The front has initials (no
  photos), name, title and a chip ("In 9:42 AM", "Late 11:48 AM", "Left 6:10 PM",
  "Away", "Not yet"). The back has In, Out ("Still in"), Worked or So far, and Where
  (Office, the site, From home); for someone not in, when the day starts. Leave is
  "Away", never why. The barcode and QR are decoration.
- Text is on the scale, 10px and up: badges stay 120 to 150px wide so it never shrinks
  under that. Palette only, no font of its own (the guard keeps the file at zero).
- The motion is a small spring simulation on `requestAnimationFrame`, no keyframes.
  Under `prefers-reduced-motion` nothing swings or sways: badges snap to their place
  and turn over at once.
- **Staff see it too** (owner, 21 Nov 2026: "who's in, no times"). For an employee the card
  is the rail alone (`StaffPulse`, `staffToday` in `Arrivals.tsx`): everyone in the studio,
  you first. A colleague's badge says In, On site, From home, Left, Away or Not yet, with
  Today and Team on the back: never a time, a late mark or hours. Their own badge keeps
  their times. Chips: In, From home, Away; no Lanyards / Faces switch. The server sends
  this as `present` (`scopeSnapshot`): today only, where and whether they left, no times;
  `attendance` still carries only what the person may see. The card stays hidden until
  the server sends `present`.
- Only on Who's in today (owner, 20 Nov 2026): the Office guide and Home's Team today pin
  were tried with the rail and taken back off; they keep their own views.
- When the badges do not fill the carousel enough to wrap round, the row keeps to its edges,
  so there is no gap beside the first or last badge.

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

### Project sidebar (approved 16 Nov 2026)

Inside a project there is no header of rows any more. The owner tried the options as clickable
prototypes and chose the quiet sidebar, with animated Lucide icons and collapse on click
(`components/projectNav/ProjectSidebar.tsx`, styles in `projectSidebar.css`). From the top:

- **Studio home** and the **bell**, always on screen (never inside a menu).
- **The project**: its tile with a progress ring, name, client · place · area, and its status (click to
  change it); Details and the team; the next step ("Next · 35% · Agreement Signed").
- **Jump to…** (Ctrl/Cmd K): every screen of the project by name.
- **Hub**, then **Journey**: the six stages on a line that fills to where the project is; the stage
  it is at has a pulsing ring and NOW; no stage is locked, so every stage opens whatever stage the
  project is at (a stage passed in as locked would show a lock and shake when clicked); the
  selected stage opens to show its screens. Then the **Project Hub**, with its counts.
- **The person** at the bottom: one row; its menu holds the studio's screens.

It collapses to a 76px icon rail on a click of the round edge button or Ctrl/Cmd B. Collapsed,
every icon names itself on hover, a stage pops out its screens, and counts become dots. Its edge
can be dragged to any width from 200 to 400px; narrower than 150px snaps it to icons; a double
click resets it. Open or icons, width and folded sections are remembered on the device. On a phone
it is a drawer opened from the page bar.

Over the page there is one slim bar: where you are (stage / screen), the page's badge and figures,
what has just changed, the studio icons and the hide-figures eye. The studio icons
(`components/projectNav/StudioJump.tsx`, approved 19 Nov 2026) are Design Desk, Ops Desk, People and
the Item Bank, each an icon button the size of the eye, naming itself on hover or focus with the
sidebar's tooltip (`psb-tip`), with a hairline rule before the eye. Each is offered only to the roles
that open that screen (`STUDIO_TAB_ROLES` and the limited roles' allow-lists); a click leaves the
project for that screen. From `sm` up; with nothing to offer, nothing is drawn.

**The way back** (`components/projectNav/BackToProject.tsx`, approved 19 Nov 2026). Leaving a project
for a studio screen (a studio icon, Studio home or the sidebar menu) remembers the project and its
screen. Every studio screen then opens with one slim row above its title: a secondary `Button`,
"← Back to *project* · *screen*", and a small × that forgets it. The project stays loaded meanwhile,
so going back reopens it exactly as it was left. Opening any project another way forgets it. A page's own view switchers and actions keep a slim
row at the top of the page (`PageTitleBlock compact`). The studio's top tabs keep their title row.

**The breadcrumb in that bar** (`components/projectNav/PageCrumbs.tsx`, approved 18 Nov 2026) moves
you between screens without opening the sidebar:

- **The stage** ("Scope & Strategy ▾") opens a list (`phd-pop`): Hub, then every stage. The current
  one is ticked, the one the project is at says NOW, locked ones are grey with their lock note and
  do nothing. A stage opens its first screen.
- **The screens beside it.** On a wide screen (`xl`) the stage's screens sit after the `/` as the
  gliding choice (`Glide`); one click opens the next screen and the white pill slides to it. Narrower, the screen's name opens the same screens as
  a list. A screen alone in its stage is just its name.
- **Project Hub** screens read "Project Hub ▾ / Ops Matrix ▾"; the name lists the hub's screens.
- It takes the sidebar's own stages and hub, so the two always show the same screens, roles and locks.

One frame (owner, 16 Nov 2026, after the audit of every project screen):
- The workspace gives every project screen one scroll area and one gutter (`ProjectWorkspace`). A
  screen never adds its own scroll box or page padding around itself.
- The page bar names a screen with the words of the sidebar row that opens it; `pageMeta` only names
  screens the sidebar does not list. The Hub is "Hub".
- A screen is listed once. Money (the payment schedule) lives in the Project Hub, not in a stage.
- Nothing floats over a screen's content. The next step is the sidebar's Next card, which opens the
  Ops Matrix; the floating "Up next" card and process panel are gone.
- Documents take the studio's name from `studioDisplayName` (`lib/studioName.ts`).
- A client document screen (Terms Docket, Execution Agreement, Handover Docket) opens on a summary:
  one row with a `Segmented` Summary / Document switch, the status `Chip` and the actions; then
  "Where it stands" (three steps), what the client agrees to, and the outline. The document itself
  is not restyled: it is what the client's copy and the PDF show, so Download PDF and Print open
  it first.
- A screen, or a list on it, with nothing in it yet shows the kit's `EmptyState`: the icon chip, a
  title, one line and at most one button. A locked screen uses `LockedState`, which is the same
  `EmptyState` with an amber "Opens after …" chip. No heroes, big icons or centred 24px titles.

Motion and icons (the owner asked to go beyond the console kit here): every stage and screen has its
own Lucide icon, and each moves on hover in its own way (a bounce, a swing, a spin, a rewind; some
draw themselves). A white highlight slides to the screen you are on. Counts pop in. Everything stops
under `prefers-reduced-motion`. Same font and brand colour.

**Glass** (asked for 18 Nov 2026): the sidebar is one pane of clear, glossy glass set into the
window's left edge from top to bottom, so it reads as part of the app, not a card stuck on it. Its
sides are straight: the owner tried a curved right side the same day and chose straight. The pane is
an SVG drawn for its real size (`glassPath` in `ProjectSidebar.tsx`). Under the glass, soft blurred
brand and slate light shows through. On it are a bright top highlight, two diagonal reflections, a
bright rim, a shade along the lower and right inner edge, a slate-400 hairline on the right edge, and
a shadow that falls to the right of the pane only. Brand and slate only, no other colours. The Next
and Jump to cards and the highlight under the current screen are glossy white glass. Content keeps
16px from each side (12px as icons). Open it is 280px wide and 76px as icons.

**Resizing:** drag the right edge, which turns brand blue while you hover or drag it (`glassEdge`).
The drag range is 200 to 400px, narrower than 150px snaps to icons, and a double click resets it.
The list has no scrollbar (on Windows a grey bar with arrows broke the pane); it fades at the top or
bottom when there is more to scroll.

### Projects as glass folders (approved 16 Nov 2026; replaced 25 Nov 2026)

Being replaced by "Projects: journey, needs you, one list" below. Keep these rules while the studio switch
still offers the folders (until the owner accepts the new screen).


The owner chose this for the Projects screen (plan item 10): every project is a glass folder on one
desk, and every action is one click. Built from `components/ui/glass-folder-cards.tsx` (the owner's
component) in `components/projects/ProjectFolder.tsx`, styled in `components/projects/projectFolders.css`;
the logic is `lib/projectFolders.ts`.

- **Stages and colours.** Six stages, each with its own colour, used for the back panel behind the folder's
  front glass (frosted, glossy glass in a light tint of that colour; no patterned art, owner's call), its flag, a soft
  glow under it, the current step on its five-step bar and the swatch on its tab: New lead `#0284c7`,
  Proposal sent `#3D52A0`, Won `#B8923A`, On site `#c2410c`, Handed over `#047857`, Lost `#64748b`.
  These stage colours are approved for this screen only; everywhere else the colour rules above hold.
- **The page.** The shell's title row carries search, Assign designer and New project. Under it, the stage
  tabs stand on the desk like cabinet dividers; the desk's edge holds the Needs-you chips, one Filters
  menu (Actual / Dummy, engagement) and the Desk / Shelves switch. No amounts on this screen.
- **A folder.** The stage flag on its tab waves (a lost project's hangs grey and still); any blocking or
  due flag sits on its shoulder; the project's next step (`services/nextActionEngine`) is a button on
  the glass, red when blocking and gold when due.
- **Stickers (owner's call, 19 Nov 2026).** Two stickers of frosted, polished glass are pressed onto the
  front glass just above the name (`.pf-sticker`, through glass-folder-cards' `stickers` slot): a blur
  behind, a gloss along the top, a soft shadow on the folder.
  - Actual / Dummy / Untagged is a rectangular label (28px tall, 6px corners, turned −3°) with its
    bottom-right corner folded back to show its silver side. Actual is brand type; Dummy is amber-tinted,
    Untagged rose-tinted.
  - How the latest BOQ was made is a round seal (62px, turned 7°) with its
    bottom-right edge lifting: Playground / Classic / No BOQ runs round its top, BOQ (or "yet") sits in the
    middle. Playground is brand glass with white type.
  Motion (owner, 25 Nov 2026, replaces "static"): a sticker presses on when it appears (drops in at an
  angle, squashes and settles on a spring, the BOQ seal a beat after the tag). On hover it lifts, straightens
  a little, its folded corner peels further to show the silver back, and a dark label beside it says what it
  means ("Real client project", "Latest BOQ made in the Playground"). A click slaps it back down and never
  opens the project; on an Untagged sticker the click offers Tag as Actual / Dummy, and the sticker gives a
  small wiggle every few seconds until it is tagged. Everything stops under reduced motion.
- **One click for everything.** The glass opens the project; hovering fans out the files (each opens its
  screen); the next-step button does the step; ··· holds Open, the files again (for touch screens),
  Change stage, Clone as template, Select and Delete.
- **Sizes.** Three across from 1240px of desk, two from 640px, one below; each folder up to 460px wide.
- **Motion.** The folder's own lean, fan and assembly; the flag's wave and ripple; folders rise in,
  staggered 55ms. All of it stops under reduced motion.

### Projects: journey, needs you, one list (approved 25 Nov 2026)

The owner dropped the glass folders and approved this screen on 25 Nov 2026, after comparing 20
layouts as clickable mockups. The approved mockup is `public/mockups/projects-journey-final-mockup.html`
(turn off its dark "Why notes" bar to see the screen alone). It replaces the folder desk on the Projects
tab. The title row, Needs-you strip (blockers, due this week) and Actual / Dummy switch stay as they are.
No amounts on this screen. The stage colours above stay approved here.

- **Journey strip** replaces the stage tabs: the five stages (New lead → Handed over) on one line, each
  with its count, its blocked count in rose and a stack of its projects' photos, then a dashed
  "Closed · n" for lost and terminated. A click filters everything below; a second click shows all.
  It is always in motion (owner, 25 Nov 2026): an arc of the stage colour circles each stage's ring
  (each stage at its own speed); a stage with a blocker sends out a soft rose pulse; the connectors'
  dashes flow towards handover in the two stages' colours, with a small glowing dot travelling along
  each; the photos bob gently and the stack cycles through every project at that stage every 2.6 s;
  the selected stage carries a slow sheen.
- **Needs you** is a horizontal carousel of cards (no scrollbar, arrows on the right), blockers first,
  then due, then the rest. A card: the project's photo, a coloured left edge (rose blocking, gold due,
  brand next), the chip and when (Overdue / Today / a day), the **project name** (16px bold, slate-900)
  with the client, the next step, and one button that does it ("Fix it" rose, "Do it" gold or brand).
  **Go through them** opens the triage deck as a modal on the `AssignProjectsModal` pattern: one card
  at a time, drag or ← → (right does it, left snoozes to tomorrow), "n of N", an "All clear" tick at
  the end.
- **One list, three views** under it, from a `Segmented` with a gliding pill: **List**, **Board**,
  **This week**. Same filters, same data.
  - **List**: `Panel` rows grouped by stage, or by designer (Group by: Stage / Designer, which shows each
    designer's live count). A row: photo (76×56, 14px corners), the **project name at 16px bold
    slate-900** turning brand on hover, client · type · area · place, the two stickers; the journey bar
    and step; health rings (journey, drawings issued, snags closed) with "n/n dwg" and open snags; the
    next-step button with its day; and ···. Hovering a row slides out its files (the screens that
    matter at its stage), one click each.
  - **Board**: one lane per stage plus Closed, glass lanes tinted with the stage colour; a card has the
    photo, stickers, name, client and the next-step button. Drag a card to change its stage.
  - **This week**: Mon to Sat columns of next steps (today ringed in brand, past days hatched with an
    Overdue chip); drag a card to another day to move its due date.
- **Ctrl K** (or a click in the search box) opens the command bar: Do next and Recent projects when empty;
  as you type, Projects, Do next and Jump to (a project's screens). ↑ ↓ and ↵.
- **Stickers** keep their look and the motion recorded under "Stickers" above.
- **Cover photos.** A project's photo is, in order: the photo set as its cover, else its latest render
  the client approved, else its latest render link (its thumbnail link too, with Drive links turned into
  images), else a default picture (owner, 25 Nov 2026; see "Default pictures" below), else, when no
  picture loads, the stage-tinted "No render yet" tile. "Set as cover" is on every render under Drawings →
  Renders; "Upload cover" is in the project's Details (owner, 25 Nov 2026).
- Everything stops under `prefers-reduced-motion`. No new fonts, no new accent colours, no half-pixel
  sizes.

**As built (Phase 1, 25 Nov 2026).** `components/projects/journey/`, with its logic in `lib/projectsJourney.ts`
(built on `lib/projectFolders.ts` and `services/nextActionEngine`; the folder desk reads the same filters
and Needs-you counts from it) and its motion in `projectsJourney.css`.
- **The switch.** Until the owner accepts the screen, the studio picks it in Studio settings → Data &
  integrations → Projects screen ("Glass folders" / "New screen", the `projectsScreen` field on the studio's
  record); the folders stay the default, as Design Desk 2.0 did (`components/projects/ProjectsScreenSwitch.tsx`).
- **Filters.** The Needs-you chips are blockers and due; Untagged, unsigned contracts, at risk, BOQ and
  engagement sit in one Filters menu beside the All / Actual / Dummy switch (owner, 25 Nov 2026).
- **A click on a row or card** opens the project's preview (as in the mockup): photo, journey, next step,
  the screens inside, and Open project / Change stage / Clone as template. The next-step button and the
  files open their screen directly.
- **Triage.** Right opens the step's screen; left snoozes it to tomorrow, kept on the device until next
  steps carry due dates.
- **Board.** A drop opens the status window at the lane's stage, so its checks and a termination still apply.
- **No amounts** in a step's title either: the steps are worked out with `hideAmounts`, so an Owner reads
  "Collect Execution Advance", not the amount.

**Cover photos as built (Phase 2, 25 Nov 2026).** `lib/coverPhoto.ts` decides, in the order above:
- **The cover.** `context.coverPhoto`. "Upload cover" in Details (`ProjectContextTier`) puts a JPG, PNG,
  WebP, AVIF or GIF of up to 10 MB in Firebase Storage at `projects/{projectId}/cover/` and replaces any
  earlier upload. "Set as cover" (a text button on a render's card, an icon in the list view; a brand
  "Cover" chip marks it) points at the render, and goes when that render is removed. A second click, or
  Remove cover, takes it off.
- **The latest render the client approved.** The photo of a design decision the client confirmed (the
  decision ledger's `photoUrl`); renders themselves carry no approval of their own.
- **The latest render.** Newest by when it was added: its thumbnail link, else its own link when that is a
  picture or a Google Drive file. Drive file links are drawn through Drive's thumbnail address; a file
  that is not shared with "anyone with the link" fails to load and the next photo is tried. Folders and
  drawings that are not renders are never used.
- The cover is the studio's: the client's portal does not show it.

**Default pictures (owner, 25 Nov 2026).** A project with no cover and no render shows a default picture
instead of the tile (`lib/defaultPhotos.ts`): the studio's own default photo, uploaded in Studio settings →
Data & integrations → Default project photo (kept in Storage at `studios/{tenantId}/projectPhoto/`), else an
interior photo for its type (apartment, bungalow or villa, shop or office, wardrobe or kitchen), one of a few
per type picked steadily by the project's id, with no people in them. A default picture always says so:
a "No render yet" tag (white, slate type, the ruler icon) on Needs-you, Board, triage and This week cards,
a small ruler badge on a List row's thumbnail, and a "No render yet" chip beside the stage chip in the preview.
The smallest photos (the strip's stack, Ctrl K, the week cards' thumbnails) carry no mark.

**Due days and health as built (Phase 3, 25 Nov 2026).**
- **A next step's day** is a calendar day in India's time. It is the one kept on the project
  (`context.nextStepDue`, by step: moved on This week, set from a row's ··· menu as Today / Tomorrow / In a
  week, or put off from the triage deck), else the step's own record: a payment invoiced is due the
  studio's payment terms after the invoice (Ops Desk settings), else on the milestone's planned date.
  Other steps have no day until someone gives one.
- **Labels:** Overdue (rose), Today, the day this week ("Thu"), or a date ("2 Dec"), beside the chip on a
  Needs-you card, under the next-step button on a row, and in the preview.
- **The Needs-you chip** reads "n due this week": the Due (gold) steps on or before Saturday, overdue
  included, or with no day yet. Needs you puts the earlier day first within blockers, due and the rest.
- **Triage:** left puts the step off to tomorrow on the project; it leaves Needs you until then.
- **This week:** Monday to Saturday as in the mockup, with every step of the week on a day (owner,
  25 Nov 2026): a step nobody has given a day sits on today (Saturday when today is Sunday), and one
  overdue from before Monday sits on Monday under its Overdue chip. A step due after Saturday is not on
  this week. Dragging a card to a day, today included, gives it that day.
- **Health rings** (a Health column between Journey and Next step): the journey in the stage colour,
  drawings issued in brand, snags closed in emerald, with "n/n dwg" and the open snags. Drawings are
  counted by a Cloud Function into `organizations/{orgId}/projectHealth/{projectId}` (only the function
  writes it); a drawing counts once a round has gone to the client or the GFC is out. Snags are the
  project's own (`snagList`), closed when resolved or verified. Rings fill over 1.2 s and stop under
  reduced motion.

### Clients: conversations (approved 25 Nov 2026)

The owner approved this screen on 25 Nov 2026, after comparing directions as clickable mockups. The
approved mockup is `public/mockups/clients-conversations-final-mockup.html`. It replaces the grid, table
and dossier drawer on the Clients tab. It is meant to look like it came from the same designer as
Projects, not to copy it. The implementation handoff is `Claude outputs/HANDOFF-clients-overhaul.md`.
**Where the mockup and this section differ, this section wins.** The mockup's teal portal chip, its
WhatsApp green button, its green live dot and its 8px, 9px and 13.5px text do not ship.

- **One `Panel`, three panes:** the client list (~300px), the thread (flexible) and the client card (~320px).
  - Below 1024px the card becomes a drawer behind a "Details" button.
  - Below 768px the list is the screen, and a tap opens the thread full width with a back arrow.
- **Title row:** `ConsoleHeader` "Clients" with a one-line blurb, the Actual / Dummy switch, Export CSV
  and "+ New client". **No studio-level numbers** (owner, 25 Nov 2026): no header vitals, no KPI strip, no
  counters, no counts on the filter labels. The only figures are one client's own Money section.
- **List:**
  - Search, then a `Segmented` of All / New activity / Owes us / Quiet.
  - A row has the cover photo (round, 40px), the client name (14px bold slate-800), and a one-line preview of the
    last thing on the thread ("You: …", "Logged: …", or "On the portal now · Proposal" in brand).
  - It also has a rose ₹ chip when they owe (hidden where amounts are hidden), and a brand dot (no number) for new
    client activity.
- **Thread:**
  - **Header:** the photo, the name (16px bold slate-900), "home · last contact", the stickers and an Edit icon button.
  - **Strip:** under the header, a permanent slate strip: "**Not live chat.** Built from StudioDesk records. Their WhatsApp
    replies appear only when someone logs them."
  - **Day dividers:** Earlier / This week / Yesterday / Today.
  - **Three kinds of entry:**
    - what the studio sent: a brand bubble on the right, "Opened in WhatsApp · logged · time" and its template chip (never "delivered" or "read");
    - what happened: an event card with an icon, a bold line and a source chip;
    - what the client said, logged by the team: a white quoted bubble on the left with "Name · from WhatsApp / a call".
  - **Milestones** (Agreement signed, Unpaid · n days, No reply in n days) are stickers centred in the thread, with the
    Stickers look and motion.
  - **Source chips** are an icon and a label, never colour alone:
    - brand for Sent from StudioDesk, Proposals and Client portal;
    - emerald for Payments;
    - gold `#B8923A` for Design Desk;
    - amber for Site & meetings;
    - slate for Logged by the team.
- **Composer:**
  - The four message templates as chips, with the one Next move suggests already selected, and a textarea.
  - **Open in WhatsApp** is the primary brand button with the WhatsApp icon (not WhatsApp green).
  - **Log their reply** is secondary. It opens an inline form: Positive / Needs a call / Wants changes / No answer, then what they said.
- **Client card:**
  - At the top: the cover photo, name, home · type · place, the stage chip and Edit.
  - Sections divided by slate-100 rules:
    - Details (with "Add phone" / "Add email" when missing);
    - Client portal (state chip Active emerald / Invite sent amber / No access slate / Revoked rose, the portal
      status line, its buttons for Owner, Admin and Ops Director only);
    - People on this account;
    - Next move;
    - Money (hidden where amounts are hidden);
    - Dossier & notes.
- **Portal status line** (one rule everywhere, per project, first match wins; a client shows their best):
  "● On the portal now · {tab}" (brand); "Last visit {when} · opened n times" (slate); "Portal not opened
  yet · access given {date}" (amber); "Portal not opened since tracking began on {date}" (amber); "Project
  not won — no portal yet" (slate); "Legacy project — handed over before the portal" (slate); "No portal
  access yet" with Give access (amber). **Viewer sees no visit information** (owner, 25 Nov 2026).
- **Portal privacy line** (owner approved, 25 Nov 2026): one `text-xs text-slate-500` line under the portal's
  sign-in button and in its existing footer or account area: "We record when you open this portal and which
  pages you view, so {studio name} can follow up on time." Not a tab, banner or pop-up.
- **Edit client / New client** and **Client portal** are modals on the `AssignProjectsModal` pattern.
  - Remove access is a rose text button with a confirm.
  - The portal modal says: "They'll see the portal tabs you've already approved for clients. Nothing new is added."
- **Motion:**
  - Panes use `hud-panel-in`; switching client uses `hud-swap`.
  - Thread entries use `hud-row-in`, staggered 35 ms and capped at 12.
  - Stickers move as recorded under "Stickers". Modals use `phd-scrim` / `phd-pop`.
  - A slow breathing brand dot marks a client who is on the portal now (an existing keyframe, not a new one).
  - Everything stops under `prefers-reduced-motion`.
  - No new fonts, no new accent colours, no half-pixel sizes, nothing below 10px.

**Decided after the Phase 0 audit (owner, 25 Nov 2026).**
- **Who sees amounts:** Owner, Admin, Ops Director and Super Admin (`holdsFinanceRole`). A Designer never
  reaches this tab; Design Head and Viewer see the screen without amounts, taken out as the money is
  loaded (`withoutAmounts`), with no ₹ chip and no "Owes us" filter.
- **Who edits a client:** the same four roles, because the email is the portal username.
- **No "Proposal" portal tab exists:** the status line and Next move name the portal tab the client opened
  (Overview, Documents, Payments…), and Next move says "Opened the portal n times since your last message".
- **The portal privacy line** goes under the sign-in button and in the portal's account menu
  (`components/client/ClientAccountMenu.tsx`): the portal has no footer.

**As built (PR A, 25 Nov 2026).** `components/ClientsDirectory.tsx` (the shell), `components/clients/`
(`ClientList`, `ClientThreadPane`, `ClientCard`, `ClientDossier`, `parts`), with the logic in
`lib/clientGroups.ts` (the grouping, which Home imports), `lib/clientList.ts` and `lib/clientNextMove.ts`.
- **Title row:** the shell's own title row, as on Projects, with the blurb in `components/pageMeta.ts` and the
  Actual / Dummy switch, Export CSV and New client through `usePageHeader` (actions only, no vitals). A
  `ConsoleHeader` under it would have put the title on screen twice.
- **Last contact** is the latest Ops Desk follow-up line for any of the client's projects, read for the whole
  list in one query (the Ops Desk's, already indexed). **Newly added** reads `scopeFlow.enabledAt`, which is
  set as a project is opened: projects carry no created date.
- **New activity** is a reply logged or a message from the client's portal since this person last opened
  the client, remembered in this browser (`ffds_clients_seen:{uid}`) for v1.
- **The thread pane** shows the client's projects and the template composer (Open in WhatsApp, not yet
  logged) until the thread itself is built. **The card** is read-only; its portal buttons are today's (Give
  access, Reset password, Copy link, Reissue link), for the four roles above. Reset and Reissue take a
  second click within 5 s. The dossier keeps today's notes in this browser until they move to follow-ups.
- **Drawers** (the card below 1024px, the dossier) slide in with `phd-drawer` over a `phd-scrim`, as the
  project's Details drawer does.

**The thread as built (PR B, 25 Nov 2026).** `lib/clientThread.ts` (pure, tested) works it out from what one
batch reads when a client is opened (`services/clientThreadService.ts`): each project's follow-ups (the latest
200), visit requests, logged visits and minutes, Design Desk meetings and, for Owner, Admin, Ops Director and
Super Admin, the lead it came from. Kept for the visit, so going back to a client reads nothing.
- **Sent** (a follow-up logged as a reminder): "Opened in WhatsApp · logged" for WhatsApp, "Logged · a call" and so
  on otherwise, with the template as its chip. **Said**: a reply, a promise, no answer, a captured chat or call
  (with its mood) and a message from the client's portal. **Team notes**: every other line.
- **Events:** enquiry received (the lead's date), proposal sent (each WhatsApp or download send, else the day the
  status said so), visits and meetings done, minutes shared and confirmed, Design Desk meetings held, records
  confirmed and drawings signed off, invoices raised and stages paid, and the client's portal actions (questions
  on a clause, approvals, changes asked for, downloads once a day per document, finishes confirmed or queried),
  plus portal links issued and access given or removed. Studio events sit on the right, the client's on the left.
- **Stickers:** Design terms / Agreement / Handover signed (gold; a gate filled in as `legacy` or
  `auto-sync-journey` is not counted), Unpaid · n days (rose, the longest invoice unpaid more than 15 days, never a
  disputed one) and No reply in n days (amber, when our message is the last word and 10 or more days old; a reply
  or a portal action answers it).
- **Days:** Earlier / This week / Yesterday / Today, in India's time. The thread opens at the bottom.

**The composer as built (PR C, 25 Nov 2026).** Everything it writes goes to the Ops Desk follow-up log, so it
is on the Ops Desk too (`lib/clientCompose.ts`, pure and tested).
- **Open in WhatsApp** opens `wa.me` on the click and then logs a WhatsApp reminder with the text as sent and
  the template as its subject. The milestone template, while an invoice is out, takes that payment's own
  subject (`pay:{milestoneId}`) so the Ops Desk counts the reminder. A line that could not be saved says
  "Not logged" with Try again; the bubble says "logged" only for a line that was.
- **Log their reply**: Positive / Needs a call / Wants changes / No answer, what they said, and from WhatsApp /
  Call / Email / Meeting. No answer is `no_answer`; the rest are `replied` with "Mood: …." as `moodOf` reads it.
  **Add a note** writes a team line. With several projects, a picker chooses which (the liveliest first).
- **Viewer** cannot write to the log (firestore.rules `mayWriteOps`): they can open WhatsApp, are told it is
  not logged, and see no Log their reply or Add a note.
- **The old browser notes** are listed in the dossier until someone presses "Move to follow-ups". Each keeps its
  day and author and an id of its own, so a second move writes nothing twice, and leaves the browser only once
  it is saved. New notes are never kept in the browser.
- What you log yourself does not mark the client as new activity for you.

**Portal visits as built (PR D, 25 Nov 2026).** `lib/portalVisits.ts` (shared with the functions, tested),
`functions/src/portalVisits.ts` (`portalPing`) and `services/portalVisitsService.ts`.
- **The portal** pings once when it loads, on every tab change and every minute while on screen, for a real
  client only (`source === 'client'`; the studio's preview never pings, and the function refuses every studio
  role). The tab is an approved lens, or Design & Scope's half; anything else is stored as "other". Nothing about
  the portal changes but the privacy line: under the sign-in button and in the account menu, `text-xs
  text-slate-500`, with the studio's name or "the studio".
- **The visit doc** `projects/{projectId}/portalVisits/{uid}` (uid, email, tenantId, firstAt, lastAt, lastTab,
  sessions, tabs, the last 20 sessions) is written only by the function; the project document is never touched.
  Staff of the studio read it, a Viewer does not, and nobody writes it from a browser.
- **The status line** (`portalStatus`, one rule per row of the handoff's table) shows on the card for each project,
  and "● On the portal now · {tab}" replaces the thread header's last contact while it holds. Tracking began on
  `PORTAL_TRACKING_SINCE` (the day the function went live).
- **The list** reads the studio's visits of the last day in one query (index `portalVisits` tenantId, lastAt desc),
  on load and every 2 minutes while on screen: a client on the portal now gets a breathing brand dot on their
  photo (the project sidebar's `psb-breathe`, still under reduced motion), "On the portal now · {tab}" as their
  preview, and a place second in the order. The opened client alone has a live listener.
- **The thread** adds "First opened the portal" and one card a day, "On the portal · Documents, Payments", in
  the portal's tab order; Next move says "Opened the portal n times since your last message".
- **A Viewer** sees "Portal access given" / "No portal access yet" and no visit anywhere: nothing is read for them.

**Edit client and New client as built (PR E, 25 Nov 2026).** `lib/clientEdit.ts` (tested) and
`components/clients/EditClientModal.tsx`, on the `AssignProjectsModal` pattern.
- **Who:** Owner, Admin, Ops Director and Super Admin (Phase 0, Q3): Edit on the card, the pencil in the thread
  header, and "Add phone" / "Add email" open it. Everyone else sees no Edit.
- **Edit** writes name, phone, email, area / city, home type, Actual / Dummy and the people on the account to every
  project of the client; the home name goes only to the project the card shows. Each project is loaded whole
  before it is saved (App.tsx `handleClientProjectUpdate`), the open project takes it in its own state, and a
  save is read back, so the screen says "Saved to n projects" or names each project that was not, with Retry.
- **Email:** changing it warns "{Name} signs in with {old email}. Their sign-in stays on the old email until you
  give access again." Nothing touches their login from here. The screen follows the client to the new key, and
  says "Merged with {name}" when another client already had it.
- **New client** asks for name, phone, email, area / city and Actual / Dummy, then opens the start window on its
  quick-add form, filled in (`StartProjectModal` `prefill`); a dummy client becomes a practice project with those
  details. A role that cannot start projects gets the start window as before.

**The client portal as built (PR F, 25 Nov 2026).** `components/clients/ClientPortalModal.tsx` and
`components/clients/portalActions.ts`, on the `AssignProjectsModal` pattern; the login functions are unchanged
(owner's decision D4).
- **Card:** the state chip and each project's status line for everyone; for Owner, Admin, Ops Director and Super
  Admin, Reset password, Copy link and More when access is on, Give access and More when it is not.
- **The window,** one project at a time (a picker when there are several): its state, the status lines, "Signs in
  with {email}" with Change (Edit client). Tiles: Give access or Reset password (a second click within 5 s; the
  temporary password shown once, "They must change it at first sign-in"), Copy portal link, Reissue link ("The old
  link stops working", a second click) and See it as the client (the project's Client Portal preview). No email:
  "Add a client email to this project first — it is their username", with Add email.
- **Sharing:** the invite (link and username) on WhatsApp or copied; the temporary password only when "Include the
  password" is ticked, off by default.
- **People:** with more than one person or project, the project's people panel (`ClientPeoplePanel`), each person
  with their own login; a portal change there is saved at once, typing after a pause.
- **Remove access** is a rose button that asks again; it calls `revokeClientLogin` and marks the project
  (`withPortalMark`). Every project change, a new link included, goes through the safe save of Edit client.
- The window says "They'll see the portal tabs you've already approved for clients. Nothing new is added."

### Project workspace: conversations (approved 27 Nov 2026, pilot)

The owner approved a second project workspace after comparing clickable mockups, on two conditions: it
must feel calm and easy, and nobody is moved to it suddenly. It is laid out like Clients, inside one
project. Classic (the sidebar above) stays, unchanged, until the pilot (the owner and Mayuri) is done.

- **The switch** (`lib/projectView.ts`): Studio settings → System → Project workspace, `projectWorkspace` on
  the studio's record: Classic (default) · Each person chooses · Conversations. A person's own choice is
  `projectView` on their `inbox/{email}` document (`services/projectViewService.ts`), from "Try the
  Conversations view" in the sidebar's person menu or "Use Classic view" in the new top bar. The studio's
  choice is read as a project opens, so a settings change never swaps the view under someone mid-work.
- **The way out, always on top:** "← All projects" (brand tint), Studio home, Clients and the studio desks
  the role may open (`studioJumpItems`), each with its word. Then the project's title row: initials tile,
  name (`text-2xl font-bold`), client · place · area, the status chip and Client portal.
- **One `Panel`, three panes**, as on Clients:
  - **Conversations** (~280px, `lib/projectConversations.ts`): Whole project, Client & portal, Money, BOQ,
    Documents, Design, Site, Plan & timeline, Brief & Site (its own, owner). Every screen of the project
    lives in exactly one, under the studio's own screen names (owner: keep them). A conversation shows
    only when the role may open one of its screens. A row: a round icon, the name, its latest line, and
    one amber dot when a note is waiting on the person. Nothing else is coloured.
  - **The conversation**: its screens as buttons ("Open: …", the first primary), then the story
    (`lib/projectThread.ts`, from the Clients thread and the project's history) grouped by day, each item
    with "Open {screen}"; only payments carry a source chip. Whole project opens on **one card**: the
    stage and steps on one line (with Ops Matrix and "Open the Hub"), then **Up next**, ranked as the Hub
    ranks it: the engine's blocker (rose "Blocker" chip), the Ops Matrix's next step ("Your sign-off" with
    Mark done, or "Milestone"), then the engine's list with its own action words (Prepare Terms, Log
    Discovery). Three show; "n more on the Hub" opens the rest (owner, 27 Nov 2026: one card, not a Next
    card and a list saying the same step twice).
    Its foot is **Record** (Site visit · Meeting · Decision, keys S · M · D). Every conversation has "Add
    a note for the team", which opens a note box only when clicked and says what a note is: a line only the
    studio sees, in the follow-up log (so on the Ops Desk too), staying in the conversation it was written
    in (subject `conv:{id}`). **No message to the client is written here** (owner, 27 Nov 2026): that is
    the Messages screen's and Clients' job.
  - **An empty conversation says where to click:** "Start here", its screens as big buttons (icon chip,
    name, the page's one-line purpose from `pageMeta`, an arrow), the first in brand.
  - **The project card** (~320px, from `xl`): At a glance (Collected and Next due for finance roles, behind
    the hide-figures eye; Drawings issued of total and approved, from the Drawing Tracker; Handover, the
    programme's forecast and target, as the Hub reads them), Client portal (the portal status line; Review & send only once the client
    has access, Give access when they have none), Timeline (the programme's next four dates and the
    handover forecast), Details and Journey.
- **Every screen opens in a full-screen window** (the modal pattern: `phd-scrim`, `phd-pop`, `rounded-3xl`):
  a brand eyebrow "Project · Conversation", the screen's name (`text-2xl font-bold`), its sister screens as a
  `Segmented`, and ✕. The screen is the same component Classic draws. The footer: "What you change here
  shows up in the … conversation", Esc, and "← Back to …". A dialog a screen opens closes before the window
  on Esc. No window opens on top of a window.
- A first-time line says what the view is and how to go back; "Got it" hides it on that device.
- **Motion** (owner, 27 Nov 2026: keep the motion the app already has): the project sidebar's and Clients'
  approved motion, nothing new. Each conversation's icon moves on hover in its own way (`.psb-ic`
  `data-a`); the highlight slides to the conversation picked (`layoutId`, as the sidebar's does); a
  needs-you dot pulses (`psb-attn`) and the stage at NOW breathes (`psb-breathe`); stickers press on and
  slap back as on Clients (`pj-stk`); rows, Up next and Start here arrive in turn (`hud-row-in`); cards and
  tiles lift on hover (`phd-lift`); figures count up (`CountUp`); the window's screen tabs glide
  (`Segmented glide`); panes `hud-panel-in`, the window `phd-scrim` / `phd-pop`. All of it stops under
  reduced motion. Same fonts and colours; no new accent.

### Summary-first sections (approved 16 Nov 2026)

Execution & Site used to nest tabs five levels deep. The owner chose option C of plan item 9:
a screen stacks its tools as sections instead of tabs, and reads top to bottom.

- Use `components/site/SectionStack.tsx`. Each section is a `Panel` card whose header is a button:
  the brand-tint icon chip, a `font-bold text-slate-800` title, and one `text-xs text-slate-500`
  line with a `Dot` saying where that tool stands ("3 open · 1 high"). A chevron turns when open.
- One section is open at a time. The screen opens the first that is bad, else the first that needs a
  look (`firstToOpen` in `lib/siteSections.ts`), once, so a ticked row never snaps the page shut.
  An old link may ask for a section instead (`focus`).
- The tool renders unchanged inside, with `embedded` to drop its own title.
- Motion: cards `hud-panel-in` staggered 30ms, the open body `hud-swap`. Nothing else.
- Used on Quality & Snags, Meetings & Reports, Selections & Orders and the renders under Drawings.

### Pricing & Tiers motion (approved 15 Nov 2026)

The owner approved Pricing & Tiers as one grid (layouts D and E, 15 Nov 2026) and asked for
"some animations and cool icons too"; on 16 Nov they asked for less scrolling and livelier motion.
It uses the People motion kit (`components/people/PeopleBits.tsx`) and the Ops Desk card motion
(`cardV`, `deskSectionV` in `components/opsDesk/DeskBits.tsx`), with the same fonts and colours.
Only `components/pricing/` and the Pricing & Tiers screen (`components/TierManager.tsx`) use it.

- One card per option, side by side. Under them, ONE view at a time from a switcher (Where the money
  goes, What's different, Offers & payments, Margin, Versions & contract), not a page of stacked sections.
- Each option carries an `IconTile` medal by its place in price: a sprout (lowest), a gem, a crown
  (highest). Its margin is a `Ring` that fills from empty, amber below the studio median or the 20% floor.
- Its price plate (price, ring, parts bar) tilts to the pointer (`Tilt`). The name, versions, Approve
  and the buttons around it do not tilt, so a click always lands where it is aimed.
- What an option is made of is one bar in four shades of the brand (Carpentry, Functional, Civil,
  Others), filling in one after another, with an icon per part: a hammer, a bolt, a brick wall, a box.
- Rows in the views carry trade icons (a chef's hat for the kitchen, a paint roller, a ceiling lamp,
  drops for plumbing, a truck for site services...). A part opens to its trades, and a trade to its BOQ lines (item, room, amount, quantity); the chevron turns.
  A line's figure opens the BOQ slide-over at that line (its room shown, the line selected); on an
  approved option a `phd-pop` dialog asks first, since editing it makes the next version.
- The view switcher's white pill glides to the chosen view (`layoutId`); its icon tips on hover. A
  view turns up into place (`deskSectionV`) and its rows rise (`listV`, `rowV`).
- The selected card gets the brand border and a rule along its top that glides to the card you pick.
  The version pill glides between v1, v2... the same way.
- Figures count up with `CountUp`; the exact price is beside it for screen readers. Bars grow from the left.
- Approving an option draws a `DoneTick` and a `Confetti` burst on its card; Approve is `pp-press`.
- Regenerate's icon turns half a circle on hover, and Add option's plus a quarter.
- The ⋯ menu and the Tune margin dialog use `phd-pop` (and `phd-scrim` for the dialog).
- Everything stops under `prefers-reduced-motion`. No new fonts, no new accent colours, no half-pixel sizes.

### Money motion (approved 18 Nov 2026)

The owner chose the "Money milestones in motion" mockup on 18 Nov 2026: Money opens on the design
and execution milestones side by side, with the GST and taxable figures on the same screen, and
"some animations and awesome icons" from the kits already approved, not a new look. Same fonts and
colours (brand, slate, rose/amber/emerald). Only the Money screen (`components/money/board/`, and
`components/PaymentCalculatorTab.tsx` where it mounts the board) uses it.

- Pieces: the People kit (`IconTile`, `Ring`, `Glide`, `DoneTick`, `Confetti`, `pp-press`, `pp-lift`,
  `pp-live`), framer-motion rises and swaps, and `CountUp` for every figure. Styles of its own are in
  `components/money/board/moneyBoardStyles.ts`, added to the page when first imported.
- Each milestone carries an `IconTile` by what it is called (`milestoneKind` in `lib/moneyBoard.ts`):
  a bulb for concept, a box for 3D, a drafting compass for drawings, a truck for material, a hammer for
  carcass and civil, a paint roller for finishes, a key for handover. Design is a pen tool, execution a
  hard hat.
- Each track has a tax plate: a `Ring` for the taxable share, a `Glide` of stops (0, 30, 50, 70,
  100%) with ±5%, one bar of what the client pays (invoiced in brand, GST in drifting brand stripes,
  cash in slate) that grows from the left, then Invoiced, GST and Cash with their icons, and
  "Taxable → Client pays".
- A change to the split or GST is a preview first: a sticky brand-bordered bar says what moves, every
  changed figure sweeps once (`mb-sheen`) with the old value struck through and the difference in a
  chip. Apply or Discard; nothing is saved until Apply.
- Moments, once each: raising sends a paper plane and stamps "Sent"; a payment draws a `DoneTick` with
  `Confetti` and stamps "Paid"; earned stamps "Earned" with a small burst, and the icon breathes a
  brand halo (`mb-halo`) until it is invoiced. A change that came from the portal or the site, not
  this screen, turns in a "Live update" badge.
- Cards lift on hover (`mb-card`), the More chevron turns, details open by height.
- Edit milestones is a modal on the `AssignProjectsModal` pattern; rows rise and leave, and the
  % / ₹ choice on each row glides (`layoutId`).
- Quick schedule (asked for 26 Nov 2026; the owner chose the radial design the same day) is a modal
  built like Edit milestones. Each track is a ring of its milestones, so it always adds up to 100%
  (`lib/quickSchedule.ts`). Drag a handle between two stages: it snaps to 5s (one pulse, `mb-snap`),
  and pulling the pointer out past the ring makes it four times finer, with a bubble showing both
  shares. Tap a stage and the middle of the ring shows − / +; arrow keys move a focused handle. A
  stage under 9% is drawn at 9%, hatched, so it can still be grabbed; its number stays exact. Paid
  and invoiced stages are grey and locked. Start from the studio default, front-loaded or even; add
  a stage by splitting one. Shares ease to new values; slices lift when selected or dragged.
- Everything stops under `prefers-reduced-motion`. No new fonts, no new accent colours, no half-pixel sizes.

### Item bank motion (asked for 21 Nov 2026)

The owner sent a screenshot of the Item bank with its nine buttons running off the side of the screen
and its status pills stacked in a column, and asked for it to be "modern and immersive, with motions",
and fluid to use. It uses the kits already approved (the People kit's `IconTile`, `listV`/`rowV` and
`pp-lift`; the Pricing view switch), with the same fonts and colours. Only the Item bank's own screen
(`components/BankTab.tsx`, `components/bank/BankCommandBar.tsx`) uses it.

- Top to bottom: five figures, then one card with the view switch and the actions, search, and the
  filters. Nothing scrolls sideways; pills wrap.
- Figures are white tiles with an `IconTile` and a `CountUp`. In project BOQs, Low margin and No recipe
  yet (Missing specs where the studio has no Material specs) are buttons: one click filters the list,
  a second click clears it. The one that is on takes the brand border. They lift on hover (`pp-lift`)
  and rise in one after another (`listV`, `rowV`).
- The view switch's white pill glides to the chosen view (`layoutId`), and its icon tips on hover. A
  view arrives with `hud-swap`; cards arrive with `hud-row-in`, a row at a time.
- Import (Excel/CSV, specs, JSON) and Export (JSON, usage) are two menus that open with `phd-pop`;
  the chevron turns. Lock prices, Repeated items and AI room kits stay as buttons, and Add item is the
  one primary, last in the row; its plus turns a quarter on hover.
- Filter and category pills are white with a `StateDot` for state; the brand fill glides to the one
  picked (`layoutId`). Every pill carries its count. The count of matching items and Clear filters sit
  beside search. `/` puts the cursor in search and Esc empties it.
- In Room kits the search and filters fold away by height.
- Reaching the end of the list brings in the next sixty items; Show more and Show all stay.
- The selection bar rises from the foot of the screen on a spring, on the modal scrim's navy
  (`#12182F`), with every action in the same quiet style and its count through `CountUp`.
- Everything stops under `prefers-reduced-motion`. No new fonts, no new accent colours, no half-pixel
  sizes; the file is at zero in the design guard.

The same day the owner asked for "the same for the item cards and spreadsheet"
(`components/BankItemCard.tsx`, `components/bank/BankSpreadsheetTable.tsx`, which By category also draws):

- A card: kit chips for category, recipe and supply; the name; the specification; internal notes behind
  a lock; a well with Cost, Margin and Factor and a margin bar that grows in and follows the figure
  (emerald from 20%, amber from 15%, rose below; full at 40%); then Unit, Supplied and Sell price. It
  lifts on hover (`pp-lift`) and takes the brand border; a ticked card takes the brand ring.
- The sheet: column heads are the field-label class and are buttons that sort, the sorted one in brand
  with its arrow. A field has no box until it is pointed at or typed in. Margin is tinted by the same
  three states. A ticked row takes the brand tint and a brand rule down its left edge. Rows arrive with
  `hud-row-in`; the specification opens under its row by height and the chevron turns.
- Row and card buttons (AI split, Duplicate, Delete) are dim until pointed at, never hidden, because a
  tablet has no hover. AI split is drawn only where AI is available.
- Fluid to work in: a row or card is drawn again only when its own item changes; the order of rows is
  held while typing and set again when a column head is clicked; a number can be emptied and retyped;
  Enter moves down a column and Shift+Enter up. Columns are fixed so nothing is cut off at 1280px.
- Both files are at zero in the design guard.

And then "the same for room kits and the modals":

- Every Item bank window opens in `components/bank/BankModal.tsx`, which is the "Modals" pattern above
  as a component (scrim, `phd-pop`, brand eyebrow, title, a scrolling body, a `bg-slate-50` footer; Esc
  and a click outside close it unless it is working). Change the selected items, Where an item is used,
  Import from Excel (`components/BulkImportModal.tsx`, which Studio also opens), AI room kits and
  Create a room kit use it. Lock prices, Repeated items and Specs from Excel were already on the pattern.
- A window with several actions switches between them with the same gliding pill as the view switch;
  its body arrives with `hud-swap`. A choice among a few is a white pill that turns brand. What a change
  will do is shown first: old value struck through, an arrow, the new value in brand.
- What stops a primary button is said on the button (disabled, with a title), not in an alert after it.
- Room kits (`components/bank/BankRoomKits.tsx`): a card per kit with an `IconTile`, an item chip and a
  base cost that counts up. The card lifts on hover and arrives with `hud-row-in`; its items open by
  height. Add an item is a search that stays open so several go in; deleting a kit asks on the card.
- All of these files are at zero in the design guard.

And "the same for material specs" (`components/materialSpecs/`). The screen keeps the approved mockup's
three columns (families, materials, the picked material); this adds to it:

- Four figures above the work, the Item bank's tiles: Materials, Priced as ranges, In an item's recipe,
  Revised.
- The family rail's brand pill glides to the family picked (`layoutId`). A family holding a change that
  is not saved carries an amber dot.
- Search looks in every family. While searching, the middle column is "Search results", each card names
  its family, the rail shows how many match in each, and picking a family ends the search. `/` puts the
  cursor in search and Esc empties it; nothing matching is an `EmptyState` with Clear search.
- A change that is not saved stays with its material while another is looked at, and its card says
  "Not saved". Picking another material used to discard it silently.
- Material cards lift (`pp-lift`), take the brand border and tip their swatch on hover; a family or a
  search arrives with `hud-swap`. Saving a version draws a `DoneTick`. History rows arrive one after
  another.
- The recipe drawer closes on Esc, says "Not saved yet" in its footer once something changed, and the
  sentence a changed part alters arrives again (`hud-swap`). Its scrim is the modal navy.
- Still at zero in the design guard, as "BOQ Playground" requires.

Standard templates (`components/TemplateEditorTab.tsx`, `components/templates/TemplateMetricsBar.tsx`;
owner, 21 Nov 2026: "doesn't allow me to see all the details"). The screen was a fixed-height box: once
the typologies, the figures and the room tabs were drawn, the room's list had room for a row and a half,
and names were cut with an ellipsis.

- The page scrolls; nothing scrolls inside a box except the Item bank picker. Top to bottom: one card
  with the typology switch (the pill glides), its actions, four figures (Room scopes, Items, Extras,
  No standard size) and the trades covered; then three columns.
- Left, the rooms as a rail, copied from Material specs: the brand pill glides to the room picked, each
  with its count, Add room last. Under 1280px the rail is a row of wrapping pills.
- Middle, the open room, as wide as the screen allows. A row is the whole item: its full name (it
  wraps), category chip, unit, rate, its standard size or "No standard size yet", its room-area share,
  its specification (two lines, the whole of it on a click), then Extra / In no option, the E C H
  marks and the bin. The header counts the items and how many each option takes, and says when the
  room lists an item the bank no longer has.
- Right, "Add from the Item bank": search, trade, and rows that add on a click; an item already in the
  room is ticked. It stays beside the room while the room scrolls (`lg:sticky`).
- Suggestions sit under the room's header as white pills on `bg-slate-50`, not on a tinted gradient.
- Rows rise in and fold away (framer-motion, as before); a room or typology arrives with `hud-swap`.
- Both files are at zero in the design guard.

Its windows (`components/templates/`, the same day: "the same for the modals this screen opens"). Add a
room, New typology, AI architect, AI audit and Preview the options each had a dark gradient header with
tinted icon tiles. They open in `components/bank/BankModal.tsx` now, like the Item bank's. Option setup
was already on the pattern.

- A problem with what is typed is said under the field as it is typed, and the primary button is
  disabled with the reason as its title. No alert, no error banner after the click.
- AI working is one line in a `hud-scanning` box, and the window cannot be closed while it works. An AI
  failure is a rose line with `role="alert"`; the audit used to fail to an empty window.
- AI audit: the score is a `Ring` with `CountUp`, emerald from 85 and amber below. Gaps are rows in one
  list with a trade chip; "Add to the room" turns into "Added". The three options' advice sits in three
  cards named by `GRADE_TIER`, Comfort on the brand tint, as in the recipe drawer.
- AI architect: the draft's rooms list every item with nothing cut and no box to scroll inside.
- Preview the options: three cards with the Pricing & Tiers medals (sprout, gem, crown) on `IconTile`,
  Comfort with the brand border and top rule; quotes count up; margin coloured by the three states. A
  room opens to its lines (the chevron turns); names wrap.
- No model name is shown on an AI window: the badge that read "Gemini 3.7" was not read from anything.
- All five files are at zero in the design guard.

Vendor directory (`components/VendorsManager.tsx`; owner, 21 Nov 2026: "the same for vendor directory").
It had gradient avatars in violet, orange and sky, tinted figure tiles, and four windows each with a look
of its own.

- Five figures: Vendors, Material, Labour, Turnkey, Average lead time. The three kinds of supplier are
  buttons that filter the list, and clear on a second click.
- One card: the Cards / Table switch, the actions (Add from projects, Export CSV, Add vendor last and
  primary), search, the count, Clear filters, sort, then Show and Trade pills that wrap, each with its
  count. Only trades a vendor is in are listed. What an action did is a line in this card, not an alert.
- A vendor's avatar is its initials on the brand tint (slate when inactive). Colour never says what a
  vendor supplies; a brand chip does.
- A card: name and trades, supply chips, phone, email and GSTIN each with a copy button that turns to a
  tick, lead time and payment terms in a well, notes, then Message and the edit and delete buttons. It
  lifts on hover (`pp-lift`) and arrives with `hud-row-in`.
- The table has the field-label heads and the same row buttons, dim until pointed at, never hidden.
- A vendor opens in a drawer from the right (`pg-slide`, as the recipe drawer): how to reach them, lead
  time and terms, trades, notes, and every project selection that names it.
- Add or edit, Message and Delete open in `components/bank/BankModal.tsx`. What they supply and trades
  are pills; payment terms is one field that suggests the usual ones.
- At zero in the design guard.

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
  read. The bell follows the same rule as the tabs. A count turns over in 3D
  when it changes (`nt-flip`). It changes the moment a note lands and never
  waits for an animation. The number stays until each thing is done, by the
  person or by the server when the thing itself is dealt with; opening the
  screen reads the updates and clears only the dot.
- More motion, asked for by the owner on 24 Nov 2026 ("more animated, more
  intuitive"), all inside this kit and with the same type and palette:
  - while someone waits, the bell sways now and then (`nt-waiting`);
  - the bell's list starts with "Waiting on you" (a rose dot that breathes,
    `nt-wait-dot`), longest wait first; those rows carry a brand edge that
    draws down (`nt-edge`);
  - a note's tile is a coin (`NoteCoin`, `nt-coin`): it leans to the pointer
    with its row and turns over to a tick when the note is marked done, then
    the row leaves;
  - on the Ops Desk a row that has waited half an hour has a rose halo
    breathing round its tile (`nt-urgent`), and a timer chip turns over each
    time it changes colour;
  - the bar counts the wait as you watch, and when more are waiting behind it
    the edges of the next cards show under it like a deck (`nt-deck`).
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

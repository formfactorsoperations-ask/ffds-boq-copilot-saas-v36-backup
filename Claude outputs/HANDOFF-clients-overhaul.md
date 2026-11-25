# Handoff: Clients screen overhaul ("Conversations")

**Approved by the owner:** 25 Nov 2026. Clients is approved. Reports is still in review and is **out of scope**.
**Revised:** 25 Nov 2026, with the owner's answers to D1–D6, "no current numbers in the new UI", the portal privacy note, and portal visits hidden from Viewer.
**Approved mockup:** `public/mockups/clients-conversations-final-mockup.html`. The working copy is `Claude outputs/studiodesk-clients-mockup.html`.
**Design rules:** `DESIGN.md`, section "Clients: conversations (approved 25 Nov 2026)". Where the mockup and DESIGN.md disagree, **DESIGN.md wins**.
**Screen being replaced:** `components/ClientsDirectory.tsx` (1,777 lines). This covers its header figures, its intel cards, its grid and table views, and its dossier drawer.

> **For Claude Code: read this whole file, then `CLAUDE.md`, then the DESIGN.md section above, before you touch code.**
> - Work one PR at a time, in the order of section 6.
> - Do Phase 0 first and report back before writing any code.
> - Stop and ask about anything marked **TBC**. Do not guess.

---

## 1. Goal

Each client becomes **one running thread** built from records StudioDesk already keeps. The thread shows:
- what the studio sent;
- what the client did (portal visits, payments, Design Desk sign-offs);
- what the team logged after a call or a WhatsApp chat.

Beside the thread is an **editable client card**, with portal access managed in place.

**Success looks like this.** The founder or Client Relations can do all of the following without leaving the Clients tab:
- open a client and know where things stand in 5 seconds;
- see whether they have opened their portal;
- send the next message from a template in one click;
- log the client's reply;
- fix a phone number or email;
- give, reset or remove portal access.

**It is not live chat.** There is no WhatsApp Business API, and the owner has ruled it out. Replies exist only when someone logs them, and the screen says so permanently.

## 2. Ground rules (from CLAUDE.md and the owner, restated so they are not missed)

1. **No current numbers in the new UI** (owner, 25 Nov 2026).
   - **What goes:**
     - The current screen's header figures go. These are the `usePageHeader` vitals: Accounts, Active sites, Delivered, and Active portfolio / Multi-project.
     - The intel cards go: book value, to call, busiest, and every other `CountUp` figure.
     - Do not add a `SummaryStrip`, KPI row or counter in their place. The title row has a title, a blurb and buttons only.
   - Filter labels carry no counts either: the Segmented reads "All / New activity / Owes us / Quiet", with no numbers.
   - **What stays, because it describes one client rather than the studio's totals:**
     - the client's own Money section;
     - Next move.
2. **Follow DESIGN.md strictly.**
   - Build from `ConsoleHeader` and `components/ui/kit.tsx` (`Panel`, `Button`, `Chip`, `Segmented`, `EmptyState`), plus `StateDot`, `LABEL` and `INPUT`, as the current file does.
   - Write no cards, buttons or empty states of your own.
   - `src/tests/designGuard.test.ts` must pass.
3. **The mockup is not the spec for colours or sizes.** It uses a teal "Client portal" chip (`#0e7490`), a WhatsApp green button (`#128c4a`), a green live dot (`#16a34a`), and 8px, 9px and 13.5px text. **None of these ship.** Use the palette mapping in DESIGN.md.
4. **Motion.**
   - Use only `hud-panel-in`, `hud-swap`, `hud-row-in`, `phd-scrim` and `phd-pop`, plus the sticker motion DESIGN.md records under "Stickers".
   - The "on the portal now" dot may use a slow breathe. Reuse an existing keyframe; do not add one.
   - PR A adds `components/clients/` to the richer-motion list in `CLAUDE.md`, pointing at the new DESIGN.md section.
   - Everything stops under `prefers-reduced-motion`.
5. **Client portal: no new tabs.**
   - Nothing in this work may add a portal tab or sub-tab, or data that unlocks one.
   - The visit tracking in PR D only *reports* which approved tab is open. Its only visible change is one privacy line on screens that already exist.
   - `lib/portalTabs.ts` and `src/tests/portalTabs.test.ts` stay untouched. If a change would touch them, **stop and ask**.
6. **Money visibility is unchanged.**
   - Roles that cannot see values today (Designer) still cannot. Use `withoutAmounts()` from `lib/clientMoney.ts` **when loading**, so amounts never reach the component for those roles.
   - In the thread, a payment reads "Paid a stage" with no figure for those roles.
   - **Do not blur figures.** Hide them, as today.
7. **Keep the client grouping key** exactly as it is: `norm(email)|norm(name)`.
   - `components/home/useStudioHomeData.ts` (line ~81) copies it "exactly".
   - PR A moves it into `lib/clientGroups.ts` and makes both files import it.
8. **Leave `App.tsx` alone** except for the props passed to `<ClientsDirectory>` (lines ~3453 and ~4119).
9. **Every PR description ends with Deploy notes** in the CLAUDE.md format (section 9). Write "Nothing" rather than leaving a heading out.
10. **Before shipping each PR,** compare a screenshot of the screen with Studio settings, and attach both to the PR.

## 3. What exists today (reuse it, do not rebuild it)

| Need | Already in the code | Notes |
|---|---|---|
| Client list and grouping | `ClientsDirectory.tsx`, the `AggregatedClient` aggregation (status → bucket, VIP, multi-project, follow-up flags) | Extract it to `lib/clientGroups.ts`. Do not rewrite it. |
| Contacts per project | `context.clientName/clientEmail/clientPhone/location/config`, `context.clientContacts[]`; `lib/clientContacts.ts` (`clientPeople`, `withPortalMark`, `contactProblems`, `isEmail`, `normEmail`, `splitEmails`) | There is **no address field** and **no referred-by field**. Do not add either. |
| Portal login | Callables `createClientLogin`, `resetClientPassword`, `revokeClientLogin` (`functions/src/index.ts`). Allowed roles: `CLIENT_LOGIN_ROLES = Super Admin, Owner, Admin, Ops Director`. Create and reset return `{email, tempPassword}` and set `mustChangePassword`. | **Keep exactly as is** (D4). Email is the username. |
| Portal link | `issuePortalAccess` / `portalTokenOf` (`services/portalAccessService.ts`). The link is `${publicAppOrigin()}/?portal=${token}`. Reissuing invalidates the old link. `context.portalAccess {token, issuedAt, issuedTo, firstUsedAt}` | **Keep as is** (D4). `firstUsedAt` is typed but **nothing writes it**, so we have no visit data today. PR D adds it. |
| Per-person portal access | `components/clients/ClientPeoplePanel.tsx` (`PORTAL_ROLES = Super Admin, Owner, Admin, Ops Director`) | Reuse it inside the portal modal. |
| Client users | `users/{uid}` with `role:'Client'`, `tenantId`, `projectIds[]`; the rules helper `isProjectClient(orgId, projectId)` | PR D's visit tracking uses the same check. |
| Follow-ups: **sent messages, logged replies, notes** | `projects/{pid}/followUps` (`FollowUp` in `lib/opsDesk.ts`; `logFollowUp()` in `services/opsDeskService.ts`). Rules ~line 982: channel `call/whatsapp/email/meeting/other`, outcome `reminded/no_answer/replied/promised/info`, note ≤ 2000 chars, `manual: true` | **This is the thread's only write path** (D2). |
| Mood of a reply | `moodOf()`, `toneOf()`, `heardFromClient()` in `lib/clientCare.ts` | Store the mood the way `moodOf` reads it. |
| Meetings and site visits | `loadVisits()`, issued MOMs (`projects/{pid}/moms`) | |
| Money | `clientMoneyOf(project)` / `withoutAmounts()` in `lib/clientMoney.ts` | |
| WhatsApp send | `window.open('https://wa.me/...')` in `ClientsDirectory.tsx` (~line 791), and the 4 `WHATSAPP_TEMPLATES` (`update`, `review`, `milestone`, `touchpoint`) | Keep the template ids. |
| Notes | **localStorage** `ffds_client_notes` | These move to followUps (D2). |
| Portal app | `components/ClientPortal.tsx` | PR D adds the visit ping here. **No visual change.** |

## 4. Phase 0: read-only audit (no code; report back)

Answer each item with file and line references, then stop.

1. Confirm every row of the table above still holds on `main`.
2. **Thread sources.** For each entry in section 5.2, find the record and field it comes from. Look in particular for:
   - where a proposal "shared on the portal" is recorded;
   - how "agreement signed" shows (status or `lifecycle`);
   - where Design Desk client sign-offs live (commit `c999cc9`);
   - where `submitClientAction` writes.
3. What `onCreateNew` does in `App.tsx`, and how to pass prefilled client fields to it (D1).
4. The exact text format `moodOf()` reads.
5. The Firestore reads needed when one client is opened (one batch per opened client, never per list row). Estimate the reads for 50 clients with 2 projects each.
6. Which roles reach the Clients tab and what each may write, including whether a Designer can write followUps under `mayWriteOps()`. **List them; do not change rules.**
7. Any test that imports from or snapshots `ClientsDirectory.tsx`.
8. **For portal tracking (PR D):**
   - where the portal's sign-in screen and any footer or account area are, for the privacy line;
   - where `ClientPortal.tsx` knows the signed-in client, the project and the current tab id;
   - how a studio user's "See it as the client" preview is told apart from a real client, so previews are never counted;
   - the date the client portal first went live for this studio, from the earliest `portalAccess.issuedAt` across projects. This decides "legacy" in section 5.7.

## 5. Screen spec (what to build)

### 5.1 Layout

One `Panel` holding three panes. Below the `ConsoleHeader` title row (title "Clients", one-line blurb, **no figures**) sit: the Actual / Dummy switch, **Export CSV** (today's export, unchanged) and **+ New client**.

| Pane | Width | Contents |
|---|---|---|
| List | ~300px | Search (clients, places, projects); a `Segmented` with **All / New activity / Owes us / Quiet** (no counts); client rows |
| Thread | flexible | Header, "not live" strip, the thread, the composer |
| Client card | ~320px | Photo, Details, Client portal, People, Next move, Money, Dossier & notes |

**Responsive behaviour:**
- **Below 1024px:** the card becomes a drawer behind a "Details" button.
- **Below 768px:** the list is the screen. Tapping a client opens its thread full width, with a back arrow.
- No horizontal page scroll at any width.

**List row.** Contents, in order:
- cover photo, using the same order as Projects;
- a small dot on the photo when the client is **on the portal now**;
- **name**, 14px bold;
- a one-line preview of the last thread entry. It reads "You: …" or "Logged: …", or "On the portal now · Proposal" in brand when the client is on the portal;
- a rose ₹ chip if they owe (hidden from Designer);
- a brand dot (no number) if there is new client activity since this user last opened the client.

**Sort and filters:**
- Sort order: newly added → on the portal now → new activity → most recent contact.
- **Quiet** means no contact for 10 or more days, excluding dormant clients.
- "New activity" uses a per-user "seen" marker in localStorage for v1.

### 5.2 The thread (derived, read-only except for the composer)

**Header:**
- photo;
- name at 16px bold;
- "home · last contact n days ago", or "● On the portal now · {tab}";
- stickers;
- an Edit icon button.

**The permanent strip** (slate, cannot be dismissed): "**Not live chat.** Built from StudioDesk records. Their WhatsApp replies appear only when someone logs them."

**Day dividers:** Earlier / This week / Yesterday / Today.

**Entry types:**

| Entry | Looks like | Comes from |
|---|---|---|
| Sent from StudioDesk | Brand bubble, right; "Opened in WhatsApp · logged · time"; template chip | followUp `channel:'whatsapp'`, `outcome:'reminded'` |
| Client said | White quoted bubble, left; "Name · from WhatsApp / a call" | followUp `outcome:'replied'`/`'promised'`/`'no_answer'` |
| Team note | Slate event card "Logged by the team" | followUp `channel:'other'`, `outcome:'info'` |
| Enquiry received | Event card | Project created date |
| Site visit / meeting done, minutes shared | Event card, amber chip | Visits and issued MOMs |
| Proposal shared | Event card, brand chip | Phase 0 finds it |
| Agreement signed | Gold sticker, centred | Status / lifecycle (Phase 0) |
| Paid a stage / invoice raised | Event card, emerald chip | `clientMoneyOf` milestones |
| Unpaid · n days | Rose sticker | Milestone due and unpaid for more than 15 days |
| Signed off drawing X | Event card, gold chip | Design Desk client sign-off (Phase 0) |
| Client action on the portal | Event card, brand chip | `submitClientAction` records (Phase 0) |
| **First opened the portal** | Event card, brand chip | `portalVisits` `firstAt` (PR D) |
| **On the portal · Proposal, Payments** | One event card per day, listing the tabs they opened that day | `portalVisits.recent` (PR D) |
| Portal invite sent / access removed | Event card | `portalAccess.issuedAt`, `clientContacts` portal marks |
| No reply in n days | Amber sticker | The last entry is ours and is 10 or more days old |

- Source chips are always an icon plus a label. Colour is never the only cue.
- A client with several projects gets **one merged thread**, with a small project tag on each entry.

### 5.3 Composer

- **Template chips:** the 4 templates. The one Next move suggests is preselected.
- Below the chips: a textarea, then two buttons.
- **Open in WhatsApp** (primary brand button, WhatsApp icon):
  - opens `wa.me`;
  - writes a followUp (`channel:'whatsapp'`, `outcome:'reminded'`, `note:` the text, `subject` from the template);
  - with several projects, a project picker defaults to the most recent active project;
  - with **no phone**, the button is disabled and an "Add phone" link sits next to it.
- **Log their reply** (secondary button) opens an inline form:
  - "How did they reply?": **Positive / Needs a call / Wants changes / No answer**;
  - what they said;
  - "from" (WhatsApp / call / email / meeting).
  - "No answer" maps to `outcome:'no_answer'`; everything else maps to `'replied'`, with the mood written into the note in `moodOf()`'s format.
- **Notes** are saved the same way (`channel:'other'`, `outcome:'info'`) from "Add a note".
- **Honesty rule:** the bubble says "Opened in WhatsApp · logged", never "Delivered" or "Read".

### 5.4 Client card (right pane)

1. **Header:** cover photo; name; home · type (`context.config`) · place (`context.location`); a stage chip; an **Edit** button.
2. **Details:** phone, email, place. "Add phone" / "Add email" links when missing.
3. **Client portal:**
   - a state chip;
   - the **portal status line** from section 5.7;
   - buttons: **Reset password**, **Copy link**, **More** when access is active; **Give access** when there is none.
   - These buttons show only for roles in `CLIENT_LOGIN_ROLES`. Everyone else sees the status line only.
4. **People on this account:** `clientPeople()` merged across projects, de-duplicated by email.
5. **Next move:** pure function `lib/clientNextMove.ts`, with tests. The rules, in order:
   1. Owes, and a milestone is overdue more than 15 days → "Invoice out — chase the payment" (template: milestone).
   2. Dormant → "Dormant — reopen it or let it go" (touchpoint).
   3. Pipeline and quiet 10 or more days → "Quiet n days — worth a call" (review). If they opened the proposal since our last message, the why reads "Opened the proposal n times since your last message".
   4. Delivered → "Delivered — ask for the referral" (touchpoint).
   5. Live on site → "On site — keep the updates going" (update).
   6. Otherwise → "In the pipeline — move it along" (review).
6. **Money:** this client's Portfolio and Owed now. It is hidden for roles that cannot see values. These are the only figures on the screen.
7. **Dossier & notes:** opens the existing dossier content as a drawer.

### 5.5 Edit client / New client (modal on the `AssignProjectsModal` pattern)

**Fields:**
- client name (required);
- phone;
- email;
- home or project name;
- area / city (`location`);
- home type (`config`);
- Actual / Dummy tag (writes `isDummy` and `projectCategory`);
- **People on this account** (writes `context.clientContacts`).

There are **no address and no referred-by fields** (D5). The footer line reads: "Email is what the client signs in to their portal with."

**Save writes back to every project in the client's group** with `db.saveProject`. Show "Saved to n projects".

**Edge cases:**
- **Changing the email changes the grouping key and the portal username.**
  - Warn before saving: "{Name} signs in with {old email}. Their sign-in stays on the old email until you give access again."
  - Do not touch Firebase Auth from this form.
  - After saving, the selection follows the client to their new key.
- **Changing the name:** the selection follows. If two groups now share a key, they merge, and the screen shows "Merged with {name}".
- **A Designer cannot edit.** The Edit button is hidden, and the rules must already enforce this (Phase 0 confirms).
- **A partial failure** gives a rose toast naming the project that failed, with a Retry.

**New client (D1, agreed):** "+ New client" creates a **lead project** through the existing `onCreateNew` path, with the form's fields prefilled. There is no `clients` collection.

### 5.6 Client portal modal

The modal is opened by roles in `CLIENT_LOGIN_ROLES` only.

- **Header:** the state chip, then the portal status line (section 5.7) for **each project**, then "Signs in with {email}" with **Change** (opens Edit at email).
- **Tiles**, **all as today** (D4):
  - **Reset password:** calls `resetClientPassword`. Shows the temporary password once, with Copy, and "They must change it at first sign-in". A two-click arm within 5 s.
  - **Copy portal link.**
  - **Reissue link:** `issuePortalAccess`. Warns "The old link stops working."
  - **See it as the client:** the existing preview, if one exists. Do not build one.
- **Give access:** calls `createClientLogin`. If there is no email, show "Add a client email to this project first — it is their username", with **Add email**.
- **Per project and per person:** with more than one project or person, embed `ClientPeoplePanel` per project.
- **Remove access:** a rose button with a confirm. Calls `revokeClientLogin` and writes the portal mark with `withPortalMark()`.
- **Sharing:** the invite and the new password are shared by WhatsApp (a prefilled `wa.me` with the link and username; the temporary password is included **only** if "include password" is ticked, off by default) or by Copy.
- **Copy:** "They'll see the portal tabs you've already approved for clients. Nothing new is added."
- **Not built:**
  - phone/OTP sign-in (D3, not required);
  - reset links or invites by email (D4, keep as is).

### 5.7 Portal status line (one rule, used in the list, the thread header, the card and the modal)

**Per project, first match wins:**

| # | Condition | Line | Tone |
|---|---|---|---|
| 1 | A client user pinged in the last 2 min | "● On the portal now · {tab label}" | brand, breathing dot |
| 2 | A visit record exists | "Last visit {relative} · opened {sessions} times" ("once" for 1) | slate |
| 3 | Access was given (login or `portalAccess.issuedAt`), but there is no visit record, and access was given **after** tracking began | "**Portal not opened yet** · access given {date}" | amber |
| 4 | As 3, but access was given **before** tracking began | "**Portal not opened** since tracking began on {date}" | amber |
| 5 | No access, and the project is in the pipeline (lead / proposal) or lost | "**Project not won** — no portal yet" | slate |
| 6 | No access, the project is delivered or completed, and no portal access was ever issued on it | "**Legacy project** — handed over before the portal" | slate |
| 7 | No access, and the project is won or active | "No portal access yet" with **Give access** | amber |

- **Tracking start:** the deploy date of PR D, stored as `PORTAL_TRACKING_SINCE` in `lib/portalVisits.ts`.
- **For the client as a whole** (list row and thread header), use the best line across their projects. "On now" beats "last visit", which beats the rest.
- **Tests:** `lib/portalVisits.ts` exports `portalStatus(project, visits, now)` as a pure function, with a test for each row above.

## 6. PR plan (one PR per session; verify on the anchor projects before the next)

| PR | Scope | Firestore / functions |
|---|---|---|
| **A** | `lib/clientGroups.ts` (extracted grouping, Home imports it); the new three-pane shell, list, filters, search, client card **read-only**, `lib/clientNextMove.ts`; **header vitals and intel cards removed**; the old grid/table/dossier removed; the CLAUDE.md motion list line | None |
| **B** | The derived thread (`lib/clientThread.ts`: pure function plus tests), loaded in one batch per opened client, the "not live" strip, stickers | None |
| **C** | Composer: Open in WhatsApp plus followUp logging; Log their reply; notes → followUps; a one-time, user-triggered import of the old localStorage notes | None if the followUps rules fit. **If a rule must change, stop and ask.** |
| **D** | **Portal visit tracking:** the `portalPing` callable, `projects/{pid}/portalVisits/{uid}`, the ping from `ClientPortal.tsx`, `lib/portalVisits.ts` (`portalStatus`), rules and tests, the status line everywhere, the thread entries | **Yes:** new function, new rules. Ship early so data starts building up. |
| **E** | Edit client / New client modal, write-back to every project, the email-change warning, merge handling | Only if Phase 0 finds a gap (ask first) |
| **F** | Client portal section and modal reusing the callables, `issuePortalAccess` and `ClientPeoplePanel`, the WhatsApp share | None |

### PR D in detail: portal visit tracking

**Callable `portalPing`** (new file `functions/src/portalVisits.ts`, exported from `index.ts`):
- **Input:** `{ projectId, tab }`.
  - `tab` must be one of the approved portal tab ids. Read them from the same source `lib/portalTabs.ts` uses. Anything else is stored as `'other'`.
- **Who counts:**
  - The caller must be signed in, with `users/{uid}.role === 'Client'`, a matching `tenantId`, and `projectId` in `projectIds`. This is the same check as `isProjectClient`.
  - **Anyone else gets `{ok:false}` and nothing is written.** This includes staff, and the "See it as the client" preview.
- **What it writes:** `projects/{pid}/portalVisits/{uid}`, with these fields:
  - `uid`, `email`, `firstAt`, `lastAt`, `lastTab`, `sessions`;
  - `tabs: {[tabId]: sessionsThatOpenedIt}`;
  - `recent: [{at, tabs[]}]`, capped at the last 20 sessions.
- **Sessions:**
  - A new session starts when `lastAt` is more than 30 minutes old.
  - `tabs[tab]` counts each tab once per session, so "opened the proposal 3 times" means 3 separate sittings.
- **Throttle:** if the last write was under 45 s ago and the tab is unchanged, return without writing.
- **It does not write the project document.** Leave `context.portalAccess.firstUsedAt` alone, to avoid save conflicts with the studio's edits. The visit doc is the source.

**`ClientPortal.tsx`** (and the portal sign-in screen, for the privacy line):
- Call `portalPing` once when the portal loads, again on every tab change, and every 60 s while `document.visibilityState === 'visible'`.
- **Fire and forget:** a failure is ignored silently and never shown to the client.
- **No new tab.** The only visible change is the privacy line.

**Rules** (`firestore.rules`):
- `match /projects/{projectId}/portalVisits/{uid}`:
  - `allow read: if ownsParentProject() && getUserData().get('role', '') != 'Viewer'` (studio users of that tenant, **not Viewer**: owner, 25 Nov 2026; Viewer access is planned later);
  - `allow write: if false` (the callable writes with the Admin SDK).
- Add tests to `firestore.security.test.ts`. They must show that:
  - a client cannot read or write the visit doc;
  - another tenant cannot read it;
  - a **Viewer** in the same studio cannot read it;
  - other studio roles can read it.

**Studio side:**
- **Viewer sees no portal visits.** For Viewer:
  - status lines 1–4 are replaced by "Portal access given" / "No portal access yet";
  - the visit entries are left out of the thread;
  - the "on the portal now" dot and preview are not shown;
  - visit docs are never read (the rules refuse it anyway).
- When a client is opened, read the visit docs of their projects.
- Hold a live listener **only** on the opened client's visit docs, so "on the portal now" updates. **No listeners for the list.**
- For list rows, read once on load and refresh every 2 minutes while the tab is visible.

**Cost:**
- At most 1 write a minute per active client.
- One read per project when a client is opened.
- **No index is needed** (single-document reads), unless Phase 0 finds otherwise.

**Privacy note in the portal (owner approved, 25 Nov 2026):**
- This records when identifiable clients use the portal, which is personal data under India's DPDP Act. So the portal says so.
- **Text** (owner may adjust the wording before merge): "We record when you open this portal and which pages you view, so {studio name} can follow up on time."
- **Where:**
  - on the portal's sign-in screen, under the sign-in button, as `text-xs text-slate-500`;
  - in the portal's existing footer or account area, if it has one (Phase 0 finds it).
- **What it must not be:** a tab, a sub-tab, a banner that blocks the portal, or a consent pop-up. It is one line of text in places that already exist. If there is no such place, **stop and ask**.
- `{studio name}` comes from the branding `portalDoor` already returns. If there is none, the line says "the studio".

**Acceptance criteria, PR D:**
- A test client signs in and the studio sees "On the portal now · Proposal" within about 1 minute. About 3 minutes after the client leaves, it changes to "Last visit …".
- "See it as the client" by an Owner writes nothing.
- A Viewer sees no visit information anywhere on the screen.
- The privacy line shows on the portal sign-in screen with the studio's name.
- Each of the 7 status lines has a unit test.
- `portalTabs.test.ts` is untouched and green.

### Acceptance criteria, all PRs

- `npm run lint` (`tsc --noEmit`) passes.
- `npx vitest run` passes, including `designGuard`, `portalTabs` and `clientContacts`.
- No new portal tab.
- **No studio-level figures anywhere on the screen.**
- A Designer sees no amounts.
- It works at 1440, 1024, 768 and 390px wide.
- Reduced motion is respected.

**Per PR:**
- **A:**
  - Home's client count equals the number of clients on Clients.
  - Every client from the old screen appears in the new list.
  - Export CSV is unchanged.
  - The header has no vitals.
- **B:**
  - The thread for a live project shows its milestones, visits and sign-offs in date order.
  - An empty thread shows an `EmptyState`.
  - The unit tests cover: multi-project merge, Designer hiding, the unpaid sticker, and "No reply in n days".
- **C:**
  - A send appears in the thread **and** in the Ops Desk follow-ups.
  - A logged mood reads back through `moodOf()`.
  - Old notes are moved only when the user clicks, and are never duplicated.
- **E:**
  - A phone edit on a 2-project client updates both projects.
  - The email-change warning appears.
  - "+ New client" creates a lead at the top of the list.
  - A Designer sees no Edit button.
- **F:**
  - Give access, reset and remove work end to end, signed in as Ops Director.
  - The reset requires the two-click arm.
  - After a reissue, the old link is refused.
  - A Designer sees the status line but no buttons.

## 7. Decisions (answered by the owner, 25 Nov 2026)

| # | Question | Answer |
|---|---|---|
| D1 | What "+ New client" creates | **A lead project with the client prefilled.** No `clients` collection. |
| D2 | Where notes, sent messages and logged replies live | **Ops Desk follow-ups** (`projects/{pid}/followUps`). |
| D3 | Phone/OTP sign-in | **Not required.** Do not show it anywhere. |
| D4 | Reset links and invites by email | **Keep as is:** Owner, Admin and Ops Director (and Super Admin) reset the password (temporary password) and reissue portal links, through the existing callables. |
| D5 | "Referred by" | **No such field.** Not on the form. Do not add one. |
| D6 | Live portal tracking | **Build it** (PR D). When the portal is not opened, say why: not opened yet, project not won, or legacy project (section 5.7). |

**Also decided (25 Nov 2026):**
- **The privacy note goes in the portal** (PR D, wording above).
- **Viewer-role staff do not see portal visits.** Showing them to Viewer is planned later and is out of scope here.

## 8. Out of scope

- Reports (still in review).
- The WhatsApp Business API.
- Any portal tab or visual change.
- Ops Desk screens.
- The client pulse score.
- Bulk messaging.
- Studio-level figures or KPIs on this screen.
- Portal visits for Viewer-role staff (planned later).

## 9. Deploy notes template (paste at the end of every PR)

**For PRs A, B, C, E and F** (no backend change expected):

```
## Deploy notes

### 1. Firebase
- Firestore rules: Nothing
- Firestore indexes: Nothing
- Storage rules: Nothing
- Cloud Functions: Nothing (createClientLogin, resetClientPassword, revokeClientLogin unchanged)
- Secrets: Nothing
- Data to change by hand: Nothing
- Order: does not matter

### 2. Server
Nothing. server.ts and environment variables are unchanged; the screen reads Firestore and calls existing callables from the browser.

### 3. Vercel
Nothing. Vercel builds the preview for this branch, and production on merge to main. No environment variables.

### 4. Google AI Studio
From `git diff --name-only origin/main...HEAD`:
- App files to copy over: <list>
- Test files to skip: <list>
- Deleted: <list or Nothing>

### 5. How to test it
Sign in as Owner: <steps>. Then sign in as Designer: <no amounts, no Edit, no portal buttons>.
```

**For PR D** (the order matters):

```
## Deploy notes

### 1. Firebase (in this order)
1. Firestore rules: `firebase deploy --only firestore:rules`
   (Firebase console → Firestore Database → Rules). Adds projects/{projectId}/portalVisits/{uid} (no Viewer reads).
2. Cloud Function: `firebase deploy --only functions:portalPing`
   (console → Functions; check portalPing shows as deployed, region as the others).
3. Then merge, so the app that calls portalPing goes live after the function exists.
   Rules first matters: they also stop Viewer reading visits.
- Firestore indexes: Nothing
- Storage rules: Nothing
- Secrets: Nothing
- Data to change by hand: Nothing. Tracking starts on the deploy date; there is no backfill.

### 2. Server
Nothing.

### 3. Vercel
Nothing. No environment variables.

### 4. Google AI Studio
From `git diff --name-only origin/main...HEAD`:
- App files to copy over: <list, including components/ClientPortal.tsx, lib/portalVisits.ts>
- Test files to skip: <list>

### 5. How to test it
1. As Ops Director, give a test client portal access and copy the link.
2. In a private window, sign in as that client and open the Proposal tab.
3. Back in StudioDesk → Clients, open the client: "On the portal now · Proposal" within about a minute.
4. Close the client's window; after about 3 minutes it reads "Last visit just now · opened once".
5. As Owner, use "See it as the client": nothing new is recorded.
6. Sign out and open the client's portal link: the privacy line shows under the sign-in button.
7. Sign in as a Viewer: no visit lines, no "on the portal now", no visit entries in the thread.
8. Check a pipeline client ("Project not won"), a delivered one with no portal ("Legacy project"), and one with access but no visit ("Portal not opened yet").
```

## 10. Kickoff prompt (paste into Claude Code)

```
Read `Claude outputs/HANDOFF-clients-overhaul.md` in full, then CLAUDE.md, then the DESIGN.md section
"Clients: conversations (approved 25 Nov 2026)". Open the approved mockup
public/mockups/clients-conversations-final-mockup.html to see the screen. D1–D6 are decided (section 7).
Note the owner's rule: no studio-level numbers anywhere on the new screen.

Do Phase 0 (section 4) only: read-only, no code changes. Report each item with file:line references,
list anything that contradicts the handoff, and list the questions still open.
Then stop and wait for me before starting PR A.
```

## 11. Phase 0 outcome (25 Nov 2026)

Phase 0 was done on 25 Nov 2026. The owner accepted every recommendation below.

**Corrections to section 3:**
- Per-person portal marks are in `context.clientPortal[email]` (`withPortalMark`), not in `clientContacts`.
- MOMs are at `organizations/{tenant}/projects/{pid}/moms`.
- `ClientMoney` has no `paidDate`; milestones do.
- Projects have no created date.
- No record shows a proposal shared on the portal.
- The portal has no "Proposal" tab. The approved tabs are overview, timeline, decisions, documents, financials and designScope.
- No "See it as the client" button exists. The studio's preview is the project's Client Portal tab (`StudioPortalPreview`, `source="preview"`).
- A Designer cannot open the Clients tab at all (`lib/roleAccess.ts` `STUDIO_TAB_ROLES.clients`).

**Decisions:**
1. The handoff, the mockup and the DESIGN.md section go into the repo in PR A. The DESIGN.md conflict is resolved by keeping both: the Clients section comes after the Projects "As built" notes.
2. Amounts show only to Owner, Admin, Ops Director and Super Admin (`holdsFinanceRole`). Design Head and Viewer get `withoutAmounts()`.
3. Edit client is for the same four roles.
4. "+ New client" prefill works like this:
   - `StartProjectModal` gets a `prefill` prop for its quick-add lead form (name, phone, email, place).
   - App passes the prefill through `onCreateNew`. This is a deliberate exception to ground rule 8.
   - A Dummy client goes through the practice project.
5. "Enquiry received" uses the lead's `createdAt` where `context.leadId` exists. Otherwise the entry is left out.
6. "Proposal shared" is built from `context.proposal.sends[]` and `proposalSentAt`. It is labelled "Proposal sent (WhatsApp / download)".
7. Portal lines and Next move name the real portal tab. Next move says "Opened the portal n times since your last message".
8. Visit docs carry `tenantId`. The list reads them with one collection-group query on recent `lastAt`, which needs one index and a collection-group read rule (no Viewer). This replaces 100 reads every 2 minutes.
9. "Due" means the invoice date for an invoiced milestone and the planned date otherwise. `paidDate` is added to `ClientMoney`.
10. The privacy line's second place is the portal's account menu (`components/client/ClientAccountMenu.tsx`).
11. `PORTAL_TRACKING_SINCE` and "access ever issued" are enough for the status rules. The earliest `portalAccess.issuedAt` is not needed.

**Known before PR E:** library copies of large projects may lack some option lines until opened (`hydrateProjectDetail`). The write-back to every project must hydrate each one before `db.saveProject`.

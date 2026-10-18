# Tervaro — The Unified Architecture & Interior Studio OS

An animation-rich, dark luxury tech landing page and interactive product showcase for Tervaro, unifying its three flagship platforms: **StudioDesk**, **DesignDesk**, and **OpsDesk**.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Based on your design responses, the landing page is designed around a **dark luxury tech** aesthetic with kinetic motion, an **interactive scroll-driven deck** highlighting the three core desks, and an **interactive sandbox walkthrough** as the primary conversion mechanism.

- **Visual Direction**: Dark luxury tech featuring deep obsidian backgrounds (`#0A0B10`), titanium hairline borders, fluid glow effects, and kinetic typography.
- **Product Architecture**: A unified presentation of Tervaro as the overarching parent OS, housing **StudioDesk** (Commercial & Finance), **DesignDesk** (Creative & Drawing Deliverables), and **OpsDesk** (Field Execution & Site Operations).
- **Showcase Format**: Dynamic scroll-driven deck with cinematic transitions between StudioDesk, DesignDesk, and OpsDesk, paired with an interactive live sandbox walkthrough preview.
- **Primary CTA**: "Launch Interactive Sandbox Walkthrough", allowing visitors to test drive simulated workflows across all three desks.

---

### 1. Overview & Core Concept

- **What It Does**: Presents Tervaro as the definitive operating platform for turnkey architecture, luxury interior firms, and design-build studios. It eliminates the disconnected chaos of spreadsheets, CAD handoffs, WhatsApp group chats, and uncollected milestone payments.
- **Target Audience / Persona**: Studio Principals, Creative Directors, Project Directors, and Operations Heads running high-stakes residential and commercial interior projects.
- **Core Value Proposition**: *"From initial client brief to final key handover: one uninterrupted line of truth across finance, design, and site execution."*

```
┌────────────────────────────────────────────────────────────────────────┐
│                              TERVARO OS                                │
│               Unified Architecture & Interior Studio OS                │
└───────┬────────────────────────┬───────────────────────────────┬───────┘
        │                        │                               │
        ▼                        ▼                               ▼
 ┌──────────────┐         ┌──────────────┐                ┌──────────────┐
 │  StudioDesk  │         │  DesignDesk  │                │   OpsDesk    │
 │  Commercial  │         │   Creative   │                │  Execution   │
 │   & Ledger   │         │  & Technical │                │   & Field    │
 └──────────────┘         └──────────────┘                └──────────────┘
```

---

### 2. User Experience, Copywriting & Visual Design

#### A. Page Architecture & Section Sequence

```
1. Top Navigation Bar (Clean 3-Zone Contract)
   ├── Brand: "TERVARO"
   ├── Nav Links: Products · Solutions · Enterprise · Proof
   └── Action: "Launch Sandbox"

2. Hero Section (Kinetic Atmospheric Statement)
   ├── Value Proposition: "The Operating System for Elite Interior Studios"
   ├── Supporting Copy: "Unify StudioDesk, DesignDesk, and OpsDesk into one synchronized workflow."
   ├── Dual Action: [Launch Interactive Sandbox] · [Watch 2-Min Studio Reel]
   └── Interactive Live Preview Widget: Live interactive telemetry HUD

3. The Three Desks — Kinetic Scroll-Driven Deck
   ├── 01. StudioDesk: "Commercial Precision & Live Margin Control"
   ├── 02. DesignDesk: "Creative Velocity & Zero-Drift Drawing Deliverables"
   └── 03. OpsDesk: "Flawless Field Execution & Site-to-Client Transparency"

4. Interactive Workflow Simulation Matrix (Interactive Sandbox Teaser)
   └── Interactive tabs switching between Lead-to-BOQ, Drawing Revisions, and Daily Site Feeds

5. Quantified Studio Impact & Proof Section
   └── Concrete outcomes: 38% faster sign-offs, 100% margin leak prevention, 0 unbilled change orders

6. Conversion & Studio Invitation Block
   └── Guided interactive sandbox launcher + Discovery session booking

7. Quiet Luxury Editorial Footer
   └── Single-line copyright, system status, legal links, and studio hub access
```

#### B. Brand Wordings & Section Copy

##### 1. Hero Headline & Positioning
- **Kicker**: `NEXT-GENERATION STUDIO INFRASTRUCTURE`
- **Display Headline**: **Where architectural vision meets ledger-grade precision.**
- **Subheadline**: Tervaro replaces fragmented spreadsheets, untracked drawing revisions, and disconnected site chaos with a single coordinated ecosystem built specifically for interior architecture studios.
- **Action Buttons**:
  - Primary: `Launch Interactive Sandbox →`
  - Secondary: `Explore The Product Suite`

##### 2. The Three Products (The Tervaro Suite)
- **StudioDesk**:
  - *Headline*: Financial governance from client inquiry to milestone payout.
  - *Copy*: Generate automated multi-tier client proposals, protect gross margins with live material rate-cards, enforce design fee lock-ins, and auto-generate stamped GST compliance agreements.
  - *Key Highlights*: Live Margin Auditing · Dynamic Proposal Tiers · Milestone Payment Engine · Contract Generator.
- **DesignDesk**:
  - *Headline*: The bridge between creative design and technical release.
  - *Copy*: Orchestrate drawing release schedules, client moodboard approvals, specification dockets, and advisory design gate approvals so no site work begins on unverified revisions.
  - *Key Highlights*: Drawing Revision Matrix · Client Approval Gate · Technical Specification Hub · 3D Asset Index.
- **OpsDesk**:
  - *Headline*: Site operations, vendor handoffs, and real-time field truth.
  - *Copy*: Connect project supervisors, procurement teams, and clients. Track daily site feeds with photo-verified milestones, resolve blockers instantaneously, and deliver pristine handover dockets.
  - *Key Highlights*: SOF Live Board · Daily Site Logs & Blocker Tracking · Vendor Dispatch · Handover & Snag Lists.

#### C. Visual Identity & Theme Tokens
- **Theme Mode**: Deep Obsidian Dark Luxury Tech.
- **Color Palette**:
  - Canvas Neutral (60%): `#08090C` (Deep obsidian background) with `#0F1117` elevated surfaces.
  - Structure & Hairlines (30%): `rgba(255, 255, 255, 0.08)` hairline borders with titanium accents (`#475569`, `#94A3B8`).
  - Luminous Accent (10%): Electric Indigo (`#6366F1`), Violet Aura (`#818CF8`), and warm goldenrod warning accents (`#F59E0B`).
- **Typography**:
  - Display: `Plus Jakarta Sans` / `Outfit` (tight tracking `-0.03em`, weighted `font-bold` and `font-semibold`).
  - Body: `DM Sans` / `Plus Jakarta Sans` (`text-slate-300`, line-height `1.65`).
  - Figures & Telemetry: `tabular-nums font-mono text-indigo-400`.
- **Motion & Kinetic Effects**:
  - Smooth Framer Motion entrance reveals (`y: 20` to `0`, `opacity: 0` to `1`).
  - Interactive hover glow cards using radial mouse-follow gradients.
  - Kinetic scroll indicators and active tab morphing underline animations.
  - Zero-lag response times ($\le 180\text{ms}$).

---

### 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale & Trade-offs |
| :--- | :--- | :--- |
| **Product Unification** | Position StudioDesk, DesignDesk, and OpsDesk as integrated modules of Tervaro OS | Clarifies company identity while giving each operational area clear ownership and dedicated workflows. |
| **Interactive Sandbox Modal** | In-app modal walkthrough simulating live actions in each desk | Higher conversion and immediate tactile proof for studio owners without requiring sign-up credentials upfront. |
| **Motion Budget** | Compositor-driven transforms (`translateY`, `opacity`, `scale`) | Ensures 60fps performance on high-DPI screens without layout thrashing or lag. |
| **Single-Page Integration** | Mountable view within the application navigation or dedicated landing tab | Allows existing studio users to preview the marketing suite or switch back to the operational OS seamlessly. |

---

### 4. Technical Architecture & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TervaroLandingPage.tsx                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroNav.tsx (3-Zone Top Bar with single-line controls)         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroHero.tsx (Kinetic Title + Value Prop + Live Teaser)        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroProductDeck.tsx (StudioDesk · DesignDesk · OpsDesk)        │  │
│  │ ├── StudioDeskCard (Live Financial Simulation: BOQ & Margins)    │  │
│  │ ├── DesignDeskCard (Drawing Pipeline & Revision Engine)          │  │
│  │ └── OpsDeskCard (Site Feed, SOF Milestones & Snag Tracker)       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroWorkflowMatrix.tsx (Interactive Cross-Desk Data Flow)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroProofMetrics.tsx (Quantified Studio ROI & Proof Badges)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroSandboxModal.tsx (Interactive Live Simulation Experience)  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ TervaroFooter.tsx (Clean Luxury Architectural Colophon)           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

#### State & Interaction Mapping

- `activeDesk`: Controls the active product card in the cinematic showcase (`'studiodesk'` | `'designdesk'` | `'opsdesk'`).
- `isSandboxOpen`: Opens the full-screen interactive sandbox simulation.
- `sandboxStep`: Multi-step interactive walkthrough inside the sandbox (1: Proposal Creation $\to$ 2: Drawing Release $\to$ 3: Site Execution & Milestone Payment).
- `onDemoRequest`: Triggers demo booking dialog with validation and immediate confirmation.

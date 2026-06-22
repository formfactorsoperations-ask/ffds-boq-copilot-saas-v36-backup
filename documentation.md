# Form Factors Design Studio - Execution OS User Guide

Welcome to the **FFDS Execution OS**. This is not a traditional project management tool or a task list dashboard. This is an embedded execution intelligence platform built specifically to handle the ground realities of interior design execution. 

This living operating system sits at the core of your studio, generating documentation, proposals, managing site execution, handling procurement lead times, orchestrating finances, and locking down your standard operating procedures.

---

## 1. The Core Philosophy

- **Execution Bundles over Tasks:** Stop micro-managing "buy hinges" and start managing "Cabinetry Installation." The OS bundles related operations to ensure site phases are tracked as unified business gates.
- **Schedule of Finishes (SOF) as the Anchor:** The SOF drives every single project. When specs are frozen, costs are frozen, and procurement rules snap into place.
- **Embedded Ops Intelligence:** The tool flags blockers (Decision Debt) natively. It proactively calculates critical dates ("You must finalize the tile choice by Friday to hit the handover date").
- **Smart Estimation & Copilot Strategy:** You define margin behavior, rules, and boilerplate documents at a high level. The AI generates client-facing proposals based on the constraints of your Studio Settings.
- **Trust-first Transparency:** Full visibility into scope variations, change orders, as-actuals tracking, and margin analysis helps justify every rupee to the client while protecting the studio’s baseline.

---

## 2. Global Configurations (Studio Workspace)

Everything in the OS pivots off your foundational rules. These menus govern the default behavior of project instances.

### Studio Settings (`Studio Setup` / `Studio Settings` tab)
Here, you customize the structural rules for all generated documents:
- **Organization Identity:** Studio name, brand color (which echoes throughout client-facing modules), GSTIN, and Logo.
- **Financial Defaults:** Standardized Design Fee (%), Default GST Rate (%), preventing disparate fee quotes among your sales team.
- **Procurement Rules:** Default Procurement Lead Times (in weeks). Modifying this automatically shifts the "SOF Freeze Date" for any handover timeline. 
- **Default Contract Wordings:** Pre-configure boilerplates such as *Force Majeure*, *Payment Terms*, *Revision Clauses*, and *Client Responsibilities*. Whenever a new contract is spun up, these custom templates are immediately applied.

### Item Bank (`Item Bank` tab)
- The unified repository of all materials, sub-assemblies, and labor costs.
- You can add proprietary vendor items, update base costs safely, define labor-to-material ratios, and establish unit-level profit margins. This acts as the truth-source for all AI estimations.

### Standard Templates (`Std. Templates` tab)
- Configure repeatable BoQ scope blocks for 1BHK / 2BHK / 3BHK templates. Customize exactly what falls into a "Standard," "Premium," or "Luxury" fit-out.

### AI Strategy (`AI Strategy` tab)
- Dial the Gemini AI's behavior when generating proposals: prioritize maximum margins vs. speed vs. luxury aesthetics. This dictates how aggressively the AI upgrades materials during a proposal draft.

### Team & RBAC (`Team & RBAC` tab)
- Set roles such as Admin, Ops Director, Site Supervisor, Vendor.
- Site supervisors are restricted from editing financial margins, ensuring the cost controls stay with management.

---

## 3. The Lead, Pitch & Proposal Phase

The system treats every new client comprehensively, moving them seamlessly from raw details into contractual lock-in.

- **Lead Profiling:** Enter basic parameters (`1500 sqft`, `Modern Minimalist`, etc.). AI Copilot runs a behavioural analysis (`Fit Score`, `Ghosting Probability`) based on your interaction notes to determine if the client is worth the effort, and suggests how to pitch them.
- **Tiered BoQ Generation:** Activating the Copilot will instantly draft 3 customized, comparative Proposal Tiers (e.g., Lean, Standard, Premium) extrapolating your Item Bank rates to the client’s dimensions.
- **Client Presentation & Document Generation:** You can generate rich PDF/HTML structures to share with the client. Using the settings from the `Studio Settings` module, generated contracts contain the exact scope boundaries, boilerplate terms, and localized financial summaries defined by your organization.

---

## 4. Execution & Operations (Ops Workspace)

Once a project is won ("Execution" mode), the OS stops being a CRM and becomes your centralized site runner.

### The SOF (Schedule of Finishes)
- Automatically generated from the signed BoQ.
- Tracks granular specifications (brand, finish, serial codes) against each line item.
- Flags dependencies based off of the `Procurement Lead Time` default you configured.

### Execution Bundles & Blockers
- Instead of disjointed tasks, execution happens in 'Bundles' (e.g. "Living Room Panelling").
- If a client hasn't approved the laminate for the panelling, the bundle goes into a **Blocked** state, and the app throws a **Decision Debt** alert.
- These dependencies visibly push out Gantt timelines and shift risk metrics onto the actual blocker (Client vs Ops vs Vendor).

### Change Orders & Financial Tracker
- Any deviation from the signed BoQ is run through the **Change Management** portal. It forces operators to document rationale, calculate the exact margin delta, and secure client sign-off.
- The Financial Configuration preserves the originally locked baseline while actively plotting deviations, ensuring that 'Goodwill' and 'Client Upgrades' are numerically distinguished in final invoices.

### Client White-Label Portal
- Your clients can log in using a secured link mapped exclusively to their ID.
- Thanks to the `Brand Color` and `Logo URL` parameters you set in the global Settings, their portal accurately reflects your studio's premium aesthetics while shielding them from margins and backend constraints. They solely approve decisions, track site milestones, and make payments.

---

## 5. Summary & Best Practices

1. **Configure Settings First:** Spend time setting up your Bank, Templates, and Studio Contract Wordings before dropping leads in. The automation thrives on well-configured constraints.
2. **Respect the Flow:** Don't bypass the Proposal generation. The Contract and SOF inherit directly from the BoQ lock stage.
3. **Log Blockers Immediately:** Do not solve bottlenecks in WhatsApp. Log "Tiles Pending Approval" as a Blocker so the OS can formally shift liability and execution timelines. 
4. **Use Force MVP Mode (For Testing):** Found in the top header, `Force MVP Mode` will disconnect Firebase and keep data exclusively inside your browser's local storage—ideal for risk-free sandbox testing.

*Built on FFDS Copilot Architecture. Secure, Reactive, and Fully Compliant.*

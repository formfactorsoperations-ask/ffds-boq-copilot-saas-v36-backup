export interface NextAction {
    id: string;
    title: string;
    why: string;
    ctaLabel: string;
    route: string;
    priority: 'blocker' | 'due' | 'suggested';
    roles: string[];
    blockedBy?: string;
}

export function getNextActions(context: {
    project: any;
    designPaymentStages?: any[];
    designGate?: any;
    drawingTrackerSummary?: any;
    scopeAdditionsSummary?: any;
    timeline?: any;
}, role: string): NextAction[] {
    const { project, designPaymentStages, designGate, drawingTrackerSummary, scopeAdditionsSummary, timeline } = context;
    const actions: NextAction[] = [];
    
    // RBAC logic: Designer must never see financials
    const isOwner = role === 'Admin' || role === 'Owner' || role === 'Ops Director';
    
    if (!project) return [];

    const stage = project.lifecycle?.stage || 1;
    const isSubstantiallyComplete = project.lifecycle?.subState === 'substantially_complete';

    // Helper for formatting INR safely for Owners
    const safeFormatINR = (amount: number) => {
        if (!isOwner || amount == null) return '';
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    // Use designPaymentStages or fallback to project.paymentMilestones
    const milestones = designPaymentStages || project.paymentMilestones || [];

    // STAGE 1: Pre-Sales
    if (stage === 1) {
        const termsSignoff = project.designAgreementSignoff;
        if (!termsSignoff || termsSignoff.status === 'pending') {
            actions.push({
                id: 'stage1_terms',
                title: 'Send Terms Docket',
                why: 'Client needs engagement terms to proceed to design phase.',
                ctaLabel: 'Prepare Terms',
                route: 'terms-docket',
                priority: 'suggested',
                roles: ['Admin', 'Owner', 'Ops Director']
            });
        } else if (termsSignoff.status === 'sent') {
            actions.push({
                id: 'stage1_terms_signed',
                title: 'Awaiting Terms Sign-off',
                why: 'Engagement terms sent. Awaiting client signature.',
                ctaLabel: 'View Status',
                route: 'terms-docket',
                priority: 'due',
                roles: ['Admin', 'Owner', 'Ops Director', 'Designer']
            });
        }
        actions.push({
            id: 'stage1_discovery',
            title: 'Book Discovery',
            why: 'Align on client requirements and vision.',
            ctaLabel: 'Log Discovery',
            route: 'site-ops?focus=discovery',
            priority: 'suggested',
            roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
        });
    }

    // STAGE 2: Design
    if (stage === 2) {
        const d1 = milestones.find((m: any) => m.id === 'd1' || m.phase === 'sign_up' || m.name?.includes('Sign'));
        if (d1 && d1.status !== 'paid') {
            const amountStr = isOwner && d1.amount ? ` (${safeFormatINR(d1.amount)})` : '';
            actions.push({
                id: 'stage2_d1',
                title: isOwner ? `Collect Design Advance${amountStr}` : 'D1 Payment Pending',
                why: 'Work should not commence without sign-up advance.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=d1',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
            });
        }

        const d2 = milestones.find((m: any) => m.id === 'd2' || m.phase === 'design_development' || m.name?.includes('Development'));
        if (d2 && (d2.status === 'invoiced' || d2.status === 'advance_requested') && d2.status !== 'paid') {
            const amountStr = isOwner && d2.amount ? ` (${safeFormatINR(d2.amount)})` : '';
            actions.push({
                id: 'stage2_d2',
                title: isOwner ? `Collect D2 Payment${amountStr}` : 'D2 Payment Pending',
                why: isOwner ? 'Invoice raised for Design Development phase.' : 'Design Development stage pending.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=d2',
                priority: 'due',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
            });
        }

        if (designGate && !designGate.gateActivated) {
            actions.push({
                id: 'stage2_gate',
                title: 'Freeze BOQ',
                why: isOwner ? 'Activate Design Gate to trigger D3 invoice and lock scope.' : 'Activate Design Gate to lock scope.',
                ctaLabel: 'Activate Gate',
                route: 'design-gate?focus=activate',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Ops Director', 'Designer']
            });
        }
    }

    // STAGE 3: Contracting
    if (stage === 3) {
        const executionSignoff = project.executionSignoff;
        if (!executionSignoff || executionSignoff.status === 'pending') {
            actions.push({
                id: 'stage3_contract_gen',
                title: 'Prepare Execution Agreement',
                why: 'Design phase closed. Execution Agreement required before site mobilization.',
                ctaLabel: 'Prepare Agreement',
                route: 'execution-agreement',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Ops Director']
            });
        } else if (executionSignoff.status === 'sent') {
            actions.push({
                id: 'stage3_contract_sign',
                title: 'Awaiting Signature',
                why: 'Awaiting client signature on the Execution Agreement.',
                ctaLabel: 'View Agreement',
                route: 'execution-agreement',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Ops Director', 'Designer']
            });
        }
    }

    // STAGE 4: Pre-Execution
    if (stage === 4) {
        const e1 = milestones.find((m: any) => m.id === 'e1' || m.phase === 'material_advance' || m.name?.includes('Material') || m.name?.includes('Execution'));
        if (e1 && e1.status !== 'paid') {
            const amountStr = isOwner && e1.amount ? ` (${safeFormatINR(e1.amount)})` : '';
            actions.push({
                id: 'stage4_e1',
                title: isOwner ? `Collect Execution Advance${amountStr}` : 'E1 Payment Pending',
                why: 'Hard gate: No POs or vendors can be mobilized before E1 clears.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=e1',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
            });
        }

        actions.push({
            id: 'stage4_mobilize',
            title: 'Mobilize',
            why: 'Prepare site for execution (NOC, utilities, protection).',
            ctaLabel: 'Workspace',
            route: 'site-ops',
            priority: 'due',
            roles: ['Admin', 'Owner', 'Designer', 'Ops Director', 'Site Supervisor']
        });
    }

    // STAGE 5: Execution
    if (stage === 5) {
        // 5a. Material Orders (Blocker if E1 unpaid)
        const e1 = milestones.find((m: any) => m.id === 'e1' || m.phase === 'material_advance' || m.name?.includes('Material') || m.name?.includes('Execution'));
        if (e1 && e1.status !== 'paid') {
            const amountStr = isOwner && e1.amount ? ` (${safeFormatINR(e1.amount)})` : '';
            actions.push({
                id: 'stage5_e1',
                title: isOwner ? `Collect Execution Advance${amountStr}` : 'E1 Payment Pending',
                why: 'Hard gate: Vendor POs blocked until E1 clears.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=e1',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director', 'Site Supervisor']
            });
        } else {
            actions.push({
                id: 'stage5_vendor_orders',
                title: 'Place Vendor Orders',
                why: 'E1 cleared. Safe to release purchase orders.',
                ctaLabel: 'Workspace',
                route: 'materials',
                priority: 'suggested',
                roles: ['Admin', 'Owner', 'Ops Director']
            });
        }

        // 5b. Structure / First-Fix (E2)
        const e2 = milestones.find((m: any) => m.id === 'e2' || m.phase === 'structure' || m.name?.includes('Structure'));
        if (e2 && (e2.status === 'invoiced' || e2.status === 'advance_requested') && e2.status !== 'paid') {
            const amountStr = isOwner && e2.amount ? ` (${safeFormatINR(e2.amount)})` : '';
            actions.push({
                id: 'stage5_e2',
                title: isOwner ? `Collect E2 Advance${amountStr}` : 'E2 Payment Pending',
                why: 'Structure / First-Fix payment is due.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=e2',
                priority: 'due',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
            });
        }

        // 5c. Finishing (E3)
        const e3 = milestones.find((m: any) => m.id === 'e3' || m.phase === 'finishing' || m.name?.includes('Finishing'));
        if (e3 && (e3.status === 'invoiced' || e3.status === 'advance_requested') && e3.status !== 'paid') {
            const amountStr = isOwner && e3.amount ? ` (${safeFormatINR(e3.amount)})` : '';
            actions.push({
                id: 'stage5_e3',
                title: isOwner ? `Collect E3 Advance${amountStr}` : 'E3 Payment Pending',
                why: 'Finishing payment is due.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=e3',
                priority: 'due',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
            });
        }

        if (scopeAdditionsSummary?.pending > 0) {
            actions.push({
                id: 'stage5_scope',
                title: 'Settle Scope Additions',
                why: `${scopeAdditionsSummary.pending} CRs pending client approval.`,
                ctaLabel: 'Review CRs',
                route: 'scope-additions?focus=pending',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Ops Director', 'Designer']
            });
        }
    }

    // STAGE 6: Handover
    if (stage === 6 || isSubstantiallyComplete) {
        const e4 = milestones.find((m: any) => m.id === 'e4' || m.phase === 'handover' || m.name?.includes('Handover'));
        if (e4 && (e4.status === 'invoiced' || e4.status === 'advance_requested') && e4.status !== 'paid') {
            const amountStr = isOwner && e4.amount ? ` (${safeFormatINR(e4.amount)})` : '';
            actions.push({
                id: 'stage6_e4',
                title: isOwner ? `Collect Handover Payment${amountStr}` : 'E4 Payment Pending',
                why: 'Final payment required for handover.',
                ctaLabel: isOwner ? 'Log Payment' : 'View Status',
                route: 'payment-calc?focus=e4',
                priority: 'blocker',
                roles: ['Admin', 'Owner', 'Designer', 'Ops Director']
            });
        }

        actions.push({
            id: 'stage6_snags',
            title: 'Close Snag List',
            why: 'All snag items must be resolved before final handover.',
            ctaLabel: 'View Snags',
            route: 'site-ops?focus=snags',
            priority: 'blocker',
            roles: ['Admin', 'Owner', 'Ops Director', 'Site Supervisor', 'Designer']
        });
        
        actions.push({
            id: 'stage6_sof',
            title: 'Complete SOF Deliveries',
            why: 'All SOF items must be delivered for handover.',
            ctaLabel: 'SOF Board',
            route: 'sof-board?focus=delivery',
            priority: 'blocker',
            roles: ['Admin', 'Owner', 'Ops Director', 'Designer']
        });
    }

    // Filter by role
    const filtered = actions.filter(a => a.roles.includes(role));

    // Sort: blocker -> due -> suggested (Priority 1, 2, 3)
    const priorityWeight = { blocker: 1, due: 2, suggested: 3 };
    filtered.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);

    return filtered.slice(0, 3);
}

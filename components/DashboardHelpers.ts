import { ProjectContext, ActiveProject } from '../types';

export function generateProjectFeed(projectContext: ProjectContext, activeProject: ActiveProject | null) {
  const items: any[] = [];
  const now = Date.now();
  const ONE_DAY = 86400000;

  // From selections (SOF)
  const selections = projectContext.materialSelections || [];
  selections.forEach(s => {
    if (s.status === 'locked' || (s as any).status === 'approved') items.push({ 
      text: `${s.itemName} selection locked ✓`, 
      emoji: '🔒', type: 'sof', 
      timestamp: s.clientConfirmedAt ? new Date(s.clientConfirmedAt).getTime() : now,
      route: 'materials'
    });
    if (s.status === 'change_requested') items.push({
      text: `${s.itemName} — change requested`,
      emoji: '⚠️', type: 'warning',
      timestamp: s.changeRequestedAt ? new Date(s.changeRequestedAt).getTime() : now,
      route: 'materials'
    });
  });

  // From decisions
  const decisions = projectContext.projectDecisions || [];
  decisions.forEach(d => {
    if (d.status === 'confirmed') items.push({
      text: `${d.title} — client approved`,
      emoji: '✅', type: 'decision',
      timestamp: d.date ? new Date(d.date).getTime() : now,
      route: 'site-ops'
    });
    if (d.status === 'rejected') items.push({
      text: `${d.title} — concern raised`,
      emoji: '⚠️', type: 'warning',
      timestamp: d.date ? new Date(d.date).getTime() : now,
      route: 'site-ops'
    });
  });

  // From payment milestones
  const milestones = projectContext.paymentMilestones || [];
  if (milestones) {
    milestones.forEach(m => {
      if (!m) return;
      if (m.status === 'paid') items.push({
        text: `${m.name} — payment received`,
        emoji: '💰', type: 'payment',
        timestamp: m.date ? new Date(m.date).getTime() : now,
        route: 'payment-calc'
      });
            const isCompleted = projectContext.lifecycle?.stage === 'completed' || projectContext.status === 'completed';
      
      if ((m.status === 'invoiced' || (m as any).status === 'advance_requested') && !isCompleted) {
         items.push({
          text: `${m.name} payment pending`,
          emoji: '⏳', type: 'alert',
          timestamp: now,
          route: 'payment-calc'
        });
      }
    });
  }

  return items.sort((a,b) => b.timestamp - a.timestamp).slice(0, 20);
}

export function calculateActionProtocol(projectContext: ProjectContext, activeProject: ActiveProject | null, journey?: any) {
  const items: any[] = [];
  const now = new Date();
  
  // -- STAGE-BASED RULES --
  const isExecution = ['won', 'execution'].includes(projectContext.status || '');
  const isApproved = !!projectContext.approvedTierId;
  const project = projectContext as any;

  if (isApproved && !isExecution) {
    if (!project.contractGeneratedAt && !project.contractSentAt && !project.contractContent) {
      items.push({
        severity: 'critical',
        title: 'Contract not generated',
        description: 'Project is in Agreement stage but no contract has been generated.',
        action: 'Generate contract',
        route: 'contract'
      });
    } else if (!project.designPhaseClosedAt) {
      items.push({
        severity: 'critical',
        title: 'Design complete gate pending',
        description: 'Contract is generated, but the Design Gate has not been activated.',
        action: 'Activate Gate',
        route: 'design-gate'
      });
    }
  }

  const milestones = projectContext.paymentMilestones || [];
  if (isExecution) {
    const hasActiveMilestones = milestones && milestones.length > 0;
    if (!hasActiveMilestones) {
      items.push({
        severity: 'critical',
        title: 'No payment milestones defined',
        description: 'Execution has started but payment schedule is not set up.',
        action: 'Set up milestones',
        route: 'payment-calc'
      });
    }
  }

  // -- PENDING PAYMENT MILESTONES --
  const isCompleted = projectContext.lifecycle?.stage === 'completed' || projectContext.status === 'completed';
  if (milestones && !isCompleted) {
    milestones.forEach(m => {
      if (m.status === 'invoiced' || (m as any).status === 'advance_requested') {
          items.push({
            severity: 'critical',
            title: `${m.name} Payment Pending`,
            description: `₹${((m as any).amount || 0).toLocaleString('en-IN')} payment not received.`,
            action: 'View milestone',
            route: 'payment-calc'
          });
      }
    });
  }

  // -- PENDING DECISIONS --
  const decisions = projectContext.projectDecisions || activeProject?.executionData?.decisions || [];

  if (decisions) {
      const disputed = decisions.filter((d: any) => d.status === 'rejected' || d.signoffStatus === 'disputed');
      const pendingOld = decisions.filter((d: any) => {
        if (d.status !== 'pending' && d.signoffStatus !== 'requested') return false;
        const requestedAt = d.signoffRequestedAt || d.createdAt || d.date;
        if (!requestedAt) return false;
        const daysSince = Math.floor((now.getTime() - new Date(requestedAt).getTime()) / 86400000);
        return daysSince > 7;
      });
      disputed.forEach((d: any) => items.push({
        severity: 'critical',
        title: `Client raised concern: ${d.title}`,
        description: d.disputeNote?.substring(0, 80) || 'See decision details',
        action: 'View decision',
        route: 'site-ops'
      }));
      pendingOld.forEach((d: any) => items.push({
        severity: 'warning',
        title: `No signoff response: ${d.title}`,
        description: 'Signoff requested 7+ days ago — no client response.',
        action: 'Send reminder',
        route: 'site-ops'
      }));
  }

  // -- SOF SELECTIONS --
  const selections = projectContext.materialSelections || [];
  if (selections) {
    const changeRequested = selections.filter(s => s.status === 'change_requested');
    const unconfirmedOld = selections.filter(s => {
      if (s.status !== 'sent_for_approval' as any) return false;
      const sentAt = (s as any).confirmationSentAt;
      if (!sentAt) return false;
      const daysSince = Math.floor((now.getTime() - new Date(sentAt).getTime()) / 86400000);
      return daysSince > 5;
    });
    changeRequested.forEach(s => items.push({
      severity: 'critical',
      title: `Selection change requested: ${s.itemName}`,
      description: s.changeReason?.substring(0, 80) || 'Client wants to change selection',
      action: 'Review selection',
      route: 'materials'
    }));
    if (unconfirmedOld.length > 0) items.push({
      severity: 'warning',
      title: `${unconfirmedOld.length} selection${unconfirmedOld.length>1?'s':''} awaiting confirmation 5+ days`,
      description: unconfirmedOld.map(s=>s.itemName).join(', ').substring(0,80),
      action: 'Send reminders',
      route: 'materials'
    });
  }

  // -- REVISION STUDIO --
  const revisionItems = projectContext.boqRevisions || [];
  if (revisionItems) {
    const pendingRevisions = revisionItems.filter((r: any) => r.signoffStatus === 'pending' || r.status === 'pending');
    if (pendingRevisions.length > 0) items.push({
      severity: 'warning',
      title: `${pendingRevisions.length} revision item${pendingRevisions.length>1?'s':''} pending client approval`,
      description: 'Revised BOQ sent but not yet approved by client.',
      action: 'View revision',
      route: 'revision-studio'
    });
  }

  // -- ACTIVE JOURNEY STEPS --
  if (journey && journey.activeSteps && journey.activeSteps.length > 0) {
      const currentStage = projectContext.lifecycle?.stage || 'pre_sales';
      let currentPhaseNo = 1;
      let currentPhaseLabel = 'Pre-Sales';
      if (currentStage === 'design') {
          currentPhaseNo = 2;
          currentPhaseLabel = 'Design';
      } else if (currentStage === 'execution') {
          currentPhaseNo = 3;
          currentPhaseLabel = 'Execution';
      } else if (currentStage === 'handover') {
          currentPhaseNo = 4;
          currentPhaseLabel = 'Handover';
      } else if (currentStage === 'completed') {
          currentPhaseNo = 4;
          currentPhaseLabel = 'Handover';
      }

      const projectAny = projectContext as any;
      if (projectAny.currentPhase) {
          currentPhaseNo = Number(projectAny.currentPhase) || currentPhaseNo;
      }

      journey.activeSteps.forEach((s: any) => {
          let updatedTitle = s.title;
          
          // Rewrite journey underway or generic phase steps to align with the Phase Controller stage
          if (s.id?.includes('underway') || s.title?.includes('Underway') || s.title?.includes('Phase')) {
              updatedTitle = `Phase ${currentPhaseNo} Underway`;
          }

          items.push({
              severity: 'warning',
              title: updatedTitle,
              description: `Currently in ${currentPhaseLabel} stage of Project lifecycle.`,
              action: 'View journey',
              route: 'project-journey'
           });
      });
  }

  // Derive stage-based high level action protocol item for execution
  if (isExecution) {
      const isSubstantiallyComplete = projectContext.lifecycle?.subState === 'substantially_complete';
      if (isSubstantiallyComplete) {
          items.push({
              severity: 'critical',
              title: 'Review Handover Readiness',
              description: 'Execution is nearly finished. Review pre-handover walkthrough & snags.',
              action: 'Begin Handover 🔑',
              route: 'project-journey'
          });
      } else {
          items.push({
              severity: 'warning',
              title: 'Weekly Site Audit',
              description: 'Execution underway — schedule pre-handover walkthrough when site is substantially complete.',
              action: 'Log Site Visit',
              route: 'site-ops'
          });
      }
  }

  const order: any = { critical: 0, warning: 1, info: 2 };
  return items.sort((a,b) => (order[a.severity] || 2) - (order[b.severity] || 2));
}

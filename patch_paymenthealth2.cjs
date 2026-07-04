const fs = require('fs');
let code = fs.readFileSync('components/PaymentHealth.tsx', 'utf8');

const target1 = `    const cv = contractValue || 0;
    const rcv = revisedContractValue || cv;

    let designCollected = 0;
    let executionCollected = 0;
    let totalInvoiced = 0; // Everything strictly marked as invoiced or paid

    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || cv;
            const amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);
            if (m.status === 'invoiced' || m.status === 'paid') {
                totalInvoiced += amount;
            }
            if (m.status === 'paid') {
                if (m.type === 'design') designCollected += amount;
                else executionCollected += amount;
            }
        });
    } else {
        // Fallback to percentage logic
        const actualPercent = Math.min(100, Math.max(0, health.actualReceived));
        designCollected = (cv * actualPercent) / 100;
        totalInvoiced = (cv * health.expectedReceived) / 100;
    }

    const collectedAmt = designCollected + executionCollected;
    const pendingCollectionAmt = Math.max(0, totalInvoiced - collectedAmt);`;

const replacement1 = `    const cv = contractValue || 0;
    const rcv = revisedContractValue || cv;

    let designCollected = 0;
    let executionCollected = 0;
    let totalInvoiced = 0; // Everything strictly marked as invoiced or paid
    
    // We expect the caller to pass accurate values if possible. For now we use the props or health object if they don't?
    // Wait, let's allow it to be passed via props or we calculate here. Wait, PaymentHealthWidget doesn't have projectContext.
    // So we should rely on props or fallback to health.overdueAmount
    
    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        // We will just do rough if no projectContext is passed (which is true in PaymentHealthWidget)
        // Wait, it is better to just keep it roughly consistent or pass the values down from the caller!
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || cv;
            const amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);
            if (m.status === 'invoiced' || m.status === 'paid') {
                totalInvoiced += amount;
            }
            if (m.status === 'paid') {
                if (m.type === 'design') designCollected += amount;
                else executionCollected += amount;
            }
        });
    } else {
        const actualPercent = Math.min(100, Math.max(0, health.actualReceived));
        designCollected = (cv * actualPercent) / 100;
        totalInvoiced = (cv * health.expectedReceived) / 100;
    }

    const collectedAmt = designCollected + executionCollected;
    const pendingCollectionAmt = Math.max(0, totalInvoiced - collectedAmt);`;

// The above replacement doesn't really do anything, it just keeps what's there because we didn't inject calculateProjectFinancials.
// Actually we can pass `projectContext` directly as a prop to `PaymentHealthWidget` and update all usages!


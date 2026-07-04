const fs = require('fs');
let code = fs.readFileSync('components/PaymentHealth.tsx', 'utf8');

const target = `export function PaymentHealthWidget({ health, contractValue, revisedContractValue }: { health: PaymentHealth, contractValue?: number | null, revisedContractValue?: number }) {
    if (!health) return null;
    if (health.loading) return <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm min-w-[300px]">Loading ledger data...</div>;

    const cv = contractValue || 0;
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

const replacement = `export function PaymentHealthWidget({ health, contractValue, revisedContractValue, projectContext }: { health: PaymentHealth, contractValue?: number | null, revisedContractValue?: number, projectContext?: any }) {
    if (!health) return null;
    if (health.loading) return <div className="p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm min-w-[300px]">Loading ledger data...</div>;

    const cv = contractValue || 0;
    const rcv = revisedContractValue || cv;

    let designCollected = 0;
    let executionCollected = 0;
    let totalInvoiced = 0; // Everything strictly marked as invoiced or paid
    let collectedAmt = 0;
    let pendingCollectionAmt = 0;

    if (projectContext) {
        // If projectContext is available, we use the accurate centralized calculation
        const { calculateProjectFinancials } = require('../lib/financialsUtils');
        const financials = calculateProjectFinancials(projectContext);
        collectedAmt = financials.totalPaid;
        designCollected = financials.designPaid;
        executionCollected = financials.executionPaid;
        totalInvoiced = financials.totalInvoicedBaseAmt;
        pendingCollectionAmt = financials.overdueAmt;
    } else {
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

        collectedAmt = designCollected + executionCollected;
        pendingCollectionAmt = Math.max(0, totalInvoiced - collectedAmt);
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('components/PaymentHealth.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('components/Dashboard.tsx', 'utf8');

const target1 = `    // 3. Cash Flow Risk Real Time
    let designCollectedAmt = 0;
    let executionCollectedAmt = 0;
    let totalInvoicedBaseAmt = 0;
    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || 0;
            const amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);
            if (m.status === 'paid') {
                if (m.type === 'design') designCollectedAmt += amount;
                else executionCollectedAmt += amount;
            }
            if (m.status === 'invoiced') {
                totalInvoicedBaseAmt += amount;
            }
        });
    } else {
        const actualPercent = Math.min(100, Math.max(0, health.actualReceived));
        designCollectedAmt = (displayContractValue * 0.2 * actualPercent) / 100;
        executionCollectedAmt = (displayContractValue * 0.8 * actualPercent) / 100;
        totalInvoicedBaseAmt = 0; // Fallback
    }
    const collectedAmt = designCollectedAmt + executionCollectedAmt;
    const actualPercentDisplay = displayContractValue > 0 ? Math.min(100, Math.round((collectedAmt / displayContractValue) * 100)) : 0;`;

const replacement1 = `    // 3. Cash Flow Risk Real Time
    const { currentProjectValue, totalPaid, designPaid, executionPaid, totalInvoicedBaseAmt, overdueAmt } = calculateProjectFinancials(projectContext, activeTier);
    
    // Override local values
    const displayContractValueFinal = currentProjectValue || displayContractValue;
    const collectedAmt = totalPaid;
    const designCollectedAmt = designPaid;
    const executionCollectedAmt = executionPaid;
    const actualPercentDisplay = displayContractValueFinal > 0 ? Math.min(100, Math.round((collectedAmt / displayContractValueFinal) * 100)) : 0;`;

code = code.replace(target1, replacement1);
code = `import { calculateProjectFinancials } from '../lib/financialsUtils';\n` + code;
fs.writeFileSync('components/Dashboard.tsx', code);

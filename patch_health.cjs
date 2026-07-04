const fs = require('fs');
let code = fs.readFileSync('hooks/usePaymentHealthScore.ts', 'utf8');

const target1 = `        paymentMilestones.forEach(m => {
            const baseAmount = m.lockedTaxableBase || 0;
            const amount = baseAmount * ((m.percentage || 0) / 100) * 1.18; // Approx with GST`;

const replacement1 = `        paymentMilestones.forEach(m => {
            const baseAmount = m.lockedTaxableBase || 0;
            const rawAmount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);
            const amount = rawAmount * 1.18; // Approx with GST`;

code = code.replace(target1, replacement1);
fs.writeFileSync('hooks/usePaymentHealthScore.ts', code);

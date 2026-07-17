const fs = require('fs');
let code = fs.readFileSync('hooks/usePaymentHealthScore.ts', 'utf8');

const regex = /if \(m\.status === 'invoiced'\) \{\s*overdueCount\+\+;\s*overdueAmount \+= Math\.round\(amount\);\s*outstandingAmount \+= Math\.round\(amount\);\s*\}/;

const replacement = `            if (m.status === 'invoiced' || m.status === 'advance_requested') {
                outstandingAmount += Math.round(amount);
                
                // Check if it is actually overdue (invoiceDate + 7 days)
                let isOverdue = false;
                const baseDateStr = m.invoiceDate || m.date;
                if (baseDateStr) {
                    const targetDate = new Date(baseDateStr);
                    if (!isNaN(targetDate.getTime())) {
                        if (m.invoiceDate) {
                            targetDate.setDate(targetDate.getDate() + 7);
                        }
                        const now = new Date();
                        now.setHours(0, 0, 0, 0);
                        if (targetDate < now) {
                            isOverdue = true;
                        }
                    }
                } else {
                    // If no date at all, assume it's overdue just in case (legacy fallback)
                    isOverdue = true;
                }

                if (isOverdue) {
                    overdueCount++;
                    overdueAmount += Math.round(amount);
                }
            }`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('hooks/usePaymentHealthScore.ts', code);
    console.log("Success");
} else {
    console.log("Target not found!");
}

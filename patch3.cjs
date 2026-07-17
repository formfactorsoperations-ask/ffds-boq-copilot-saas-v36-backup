const fs = require('fs');
let code = fs.readFileSync('lib/financialsUtils.ts', 'utf8');

const regex = /if \(m\.status === 'invoiced'\) \{\s*totalInvoicedBaseAmt \+= finalAmount;\s*overdueAmt \+= finalAmount;\s*\}/;

const replacement = `        if (m.status === 'invoiced' || m.status === 'advance_requested') {
            totalInvoicedBaseAmt += finalAmount;
            
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
                isOverdue = true;
            }

            if (isOverdue) {
                overdueAmt += finalAmount;
            }
        }`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('lib/financialsUtils.ts', code);
    console.log("Success");
} else {
    console.log("Target not found!");
}

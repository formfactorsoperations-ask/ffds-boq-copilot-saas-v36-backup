const fs = require('fs');
let code = fs.readFileSync('components/ProjectListTab.tsx', 'utf8');

const regex = /\s*\/\/ 5\. Payment Due \(within 7 days or overdue\)[\s\S]*?conditions\.push\(\{[^{}]*?text: isOverdue \? `Payment Overdue \$\{d\}` : `Payment due \$\{d\}`,\s*isAlert: isOverdue\s*\}\);\s*\}/;

const replacement = `                      // 5. Payment Due (within 7 days or overdue)
                      const upcomingOrOverdue = project.context?.paymentMilestones
                        ?.map((m) => {
                          const st = m.status?.toLowerCase();
                          if (st === "paid" || st === "cleared" || st === "received") return null;
                          if (st !== "invoiced" && st !== "advance_requested") return null;

                          const baseDateStr = m.invoiceDate || m.date;
                          if (!baseDateStr) return null;
                          
                          const targetDate = new Date(baseDateStr);
                          if (isNaN(targetDate.getTime())) return null;
                          
                          if (m.invoiceDate) {
                              targetDate.setDate(targetDate.getDate() + 7);
                          }

                          return { m, targetDate };
                        })
                        .filter((item): item is { m: any, targetDate: Date } => item !== null)
                        .filter((item) => {
                          const in7Days = new Date();
                          in7Days.setDate(in7Days.getDate() + 7);
                          return item.targetDate <= in7Days;
                        })
                        .sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());

                      if (upcomingOrOverdue && upcomingOrOverdue.length > 0) {
                        const { targetDate } = upcomingOrOverdue[0];
                        const now = new Date();
                        now.setHours(0, 0, 0, 0); // compare dates only
                        const isOverdue = targetDate < now;
                        
                        const d = targetDate.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                        
                        conditions.push({
                          dot: isOverdue ? "bg-rose-500 animate-pulse" : "bg-amber-500",
                          text: isOverdue ? \`Payment Overdue \${d}\` : \`Payment due \${d}\`,
                          isAlert: isOverdue
                        });
                      }`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('components/ProjectListTab.tsx', code);
    console.log("Success");
} else {
    console.log("Target not found!");
}

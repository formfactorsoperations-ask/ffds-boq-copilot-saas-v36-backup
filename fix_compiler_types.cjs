const fs = require('fs');
let code = fs.readFileSync('services/weeklyReportCompiler.ts', 'utf8');

code = code.replace(/const paymentStages = milestonesSnap.docs.map\(d => \(\{ id: d.id, ...d.data\(\) \}\)\);/, 'const paymentStages = milestonesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];');
code = code.replace(/const scopeAdditions = projectUpdatesSnap.docs.map\(d => \(\{ id: d.id, ...d.data\(\) \}\)\);/, 'const scopeAdditions = projectUpdatesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];');
code = code.replace(/const sofItems = sofSnap.docs.map\(d => \(\{ id: d.id, ...d.data\(\) \}\)\);/, 'const sofItems = sofSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];');

code = code.replace(/prevDrawingsMap.get\(d.id\).currentRound/, '(prevDrawingsMap.get(d.id) as any).currentRound');
code = code.replace(/prevScopeMap.get\(s.id\).status/, '(prevScopeMap.get(s.id) as any).status');
code = code.replace(/prevPaymentMap.get\(p.id\).status/, '(prevPaymentMap.get(p.id) as any).status');

fs.writeFileSync('services/weeklyReportCompiler.ts', code);
console.log('Fixed typescript errors');

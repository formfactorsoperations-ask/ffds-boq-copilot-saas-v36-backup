const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// Remove duplicate onSchedule
code = code.replace(/import { onSchedule } from "firebase-functions\/v2\/scheduler";\nimport { onSchedule } from "firebase-functions\/v2\/scheduler";/, 'import { onSchedule } from "firebase-functions/v2/scheduler";');

// Fix unknown type errors
code = code.replace(/prevDrawingsMap.get\(d.id\).currentRound/, '(prevDrawingsMap.get(d.id) as any).currentRound');
code = code.replace(/prevScopeMap.get\(s.id\).status/, '(prevScopeMap.get(s.id) as any).status');
code = code.replace(/prevPaymentMap.get\(p.id\).status/, '(prevPaymentMap.get(p.id) as any).status');

fs.writeFileSync('functions/src/index.ts', code);
console.log('Fixed typescript errors in functions');

const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// replace all import { onSchedule } from "firebase-functions/v2/scheduler";
code = code.replace(/import { onSchedule } from "firebase-functions\/v2\/scheduler";\n/g, '');

// add it once at the top
code = 'import { onSchedule } from "firebase-functions/v2/scheduler";\n' + code;

fs.writeFileSync('functions/src/index.ts', code);
console.log('Fixed onSchedule import');

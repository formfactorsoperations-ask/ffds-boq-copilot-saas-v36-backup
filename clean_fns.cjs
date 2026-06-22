const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// remove everything from createBaselineVersion onwards
const startIndex = code.indexOf('export const createBaselineVersion');
if (startIndex !== -1) {
    code = code.substring(0, startIndex);
}

fs.writeFileSync('functions/src/index.ts', code);
console.log('cleaned functions');

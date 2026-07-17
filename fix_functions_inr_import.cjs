const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// Insert import at top
code = code.replace(/import { GoogleGenAI } from "@google\/genai";/, 'import { GoogleGenAI } from "@google/genai";\nimport { formatINR } from "../../src/lib/utils";');

// Replace the inline format with formatINR
code = code.replace(/chargeLine = `₹\$\{Math.round\(Number\(amount\)\).toLocaleString\('en-IN'\)\} \\u00B7 \$\{s.id\} \(invoiced\)`/, 'chargeLine = `${formatINR(amount)} \\u00B7 ${s.id} (invoiced)`');

fs.writeFileSync('functions/src/index.ts', code);
console.log('Fixed INR import in functions');

const fs = require('fs');
let code = fs.readFileSync('components/Dashboard.tsx', 'utf8');

const target1 = `<p className="text-xl md:text-2xl font-bold tracking-tight text-indigo-950 mb-1">{formatINR(displayContractValue)}</p>`;
const replacement1 = `<p className="text-xl md:text-2xl font-bold tracking-tight text-indigo-950 mb-1">{formatINR(displayContractValueFinal)}</p>`;

const target2 = `<p className="text-xl md:text-2xl font-bold tracking-tight text-emerald-600 mb-1">{formatINR(health.overdueAmount)}</p>`;
const replacement2 = `<p className="text-xl md:text-2xl font-bold tracking-tight text-emerald-600 mb-1">{formatINR(overdueAmt)}</p>`;

const target3 = `<p className="text-xl md:text-2xl font-bold tracking-tight text-indigo-950 mb-1">{formatINR(Math.max(0, displayContractValue - collectedAmt - totalInvoicedBaseAmt))}</p>`;
const replacement3 = `<p className="text-xl md:text-2xl font-bold tracking-tight text-indigo-950 mb-1">{formatINR(Math.max(0, displayContractValueFinal - collectedAmt - totalInvoicedBaseAmt))}</p>`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
code = code.replace(target3, replacement3);
fs.writeFileSync('components/Dashboard.tsx', code);

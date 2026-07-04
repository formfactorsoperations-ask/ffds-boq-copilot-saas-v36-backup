const fs = require('fs');
let code = fs.readFileSync('components/PaymentCalculatorTab.tsx', 'utf8');

const target = `                                    const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                                    rowBaseOriginal = remainingBaseForPercentages * relativePct;
                                }
                                effectiveTaxableBaseForLocking = baseAmount;`;

const replacement = `                                    const relativePct = unpaidPctExcludingFixed > 0 ? (m.percentage / unpaidPctExcludingFixed) : 0;
                                    rowBaseOriginal = remainingBaseForPercentages * relativePct;
                                }
                                effectiveTaxableBaseForLocking = m.percentage > 0 ? (rowBaseOriginal / (m.percentage / 100)) : baseAmount;`;

code = code.replace(target, replacement);
fs.writeFileSync('components/PaymentCalculatorTab.tsx', code);
console.log("Patched PaymentCalculatorTab.tsx");

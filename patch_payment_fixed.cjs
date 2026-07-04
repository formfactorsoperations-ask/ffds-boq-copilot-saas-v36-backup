const fs = require('fs');
let code = fs.readFileSync('components/PaymentCalculatorTab.tsx', 'utf8');

const target1 = `                                                    // Use lockedTaxableBase if available, otherwise fallback to origBase
                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        // This is a simplified approximation for the modal
                                                        amount = baseAmount * (m.percentage / 100); 
                                                    }`;

const replacement1 = `                                                    // Use lockedTaxableBase if available, otherwise fallback to origBase
                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        // This is a simplified approximation for the modal
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100); 
                                                    }`;

code = code.replace(target1, replacement1);

const target2 = `                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        amount = baseAmount * (m.percentage / 100); 
                                                    }`;

const replacement2 = `                                                    let amount = 0;
                                                    if (isCleared) {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || origBase) * (m.percentage / 100);
                                                    } else {
                                                        amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100); 
                                                    }`;

code = code.replace(target2, replacement2);
fs.writeFileSync('components/PaymentCalculatorTab.tsx', code);

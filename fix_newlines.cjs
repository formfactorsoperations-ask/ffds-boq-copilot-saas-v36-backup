const fs = require('fs');
let content = fs.readFileSync('components/PaymentGatesTab.tsx', 'utf8');

const oldTemplate = 'const template = `Dear ${clientName},\n\nGreetings from Form Factors Design Studio.\n\nThis is a gentle reminder regarding the ${gate.label} invoice of ₹${amtStr} raised on ${dateStr}, which is currently pending. The work linked to this stage has been completed/substantially completed as per the approved scope.\n\nAny minor pending items already noted are being scheduled separately and do not form part of this stage\'s payment.\n\nWe request you to kindly process the payment so the next stage can proceed as planned.\n\nPlease let us know if you would like to review any specific item — we can take it up in a scheduled call.\n\nRegards, FFDS`;';

const newTemplate = 'const template = `Dear ${clientName},\nGreetings from Form Factors Design Studio.\nThis is a gentle reminder regarding the ${gate.label} invoice of ₹${amtStr} raised on ${dateStr}, which is currently pending. The work linked to this stage has been completed/substantially completed as per the approved scope.\nAny minor pending items already noted are being scheduled separately and do not form part of this stage\'s payment.\nWe request you to kindly process the payment so the next stage can proceed as planned.\nPlease let us know if you would like to review any specific item — we can take it up in a scheduled call.\nRegards, FFDS`;';

content = content.replace(oldTemplate, newTemplate);
fs.writeFileSync('components/PaymentGatesTab.tsx', content);

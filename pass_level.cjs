const fs = require('fs');
let content = fs.readFileSync('components/client/ClientExportView.tsx', 'utf8');

content = content.replace(
  "<ClientSnapshot \n                                         investmentMin={investmentMin}\n                                         investmentMax={investmentMax}",
  "<ClientSnapshot \n                                         level={level}\n                                         investmentMin={investmentMin}\n                                         investmentMax={investmentMax}"
);

fs.writeFileSync('components/client/ClientExportView.tsx', content);
console.log('patched ClientExportView snapshot level');

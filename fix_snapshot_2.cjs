const fs = require('fs');
let content = fs.readFileSync('components/client/ClientExportView.tsx', 'utf8');

content = content.replace(
  "<ClientSnapshot \n                                     investmentMin={approvedTier.summary.totalSell}",
  "<ClientSnapshot level=\"LEVEL_2\"\n                                     investmentMin={approvedTier.summary.totalSell}"
);

fs.writeFileSync('components/client/ClientExportView.tsx', content);
console.log('Fixed ClientExportView L2 Snapshot');

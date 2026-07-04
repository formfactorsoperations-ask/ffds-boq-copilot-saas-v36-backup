const fs = require('fs');

// Fix ClientDecisionLock
let cdl = fs.readFileSync('components/client/ClientDecisionLock.tsx', 'utf8');
cdl = cdl.replace(
  "const ClientDecisionLock: React.FC<ClientDecisionLockProps> = ({ decision, projectName, phoneNumber, settings }) => {",
  "const ClientDecisionLock: React.FC<ClientDecisionLockProps> = ({ level, decision, projectName, phoneNumber, settings }) => {"
);
fs.writeFileSync('components/client/ClientDecisionLock.tsx', cdl);
console.log('Fixed ClientDecisionLock');

// Fix server.ts
let serverTs = fs.readFileSync('server.ts', 'utf8');
if (serverTs.includes("require('fs')")) {
    serverTs = `import * as fs from 'fs';\n` + serverTs;
    serverTs = serverTs.replace("require('fs')", "fs");
    fs.writeFileSync('server.ts', serverTs);
    console.log('Fixed server.ts');
}

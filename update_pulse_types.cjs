const fs = require('fs');
let content = fs.readFileSync('/app/applet/types.ts', 'utf-8');

const search = `  roomProgress?: Record<string, number>;`;
const replace = `  roomProgress?: Record<string, number>;
  revisions?: { id: string; drawing: string; change: string; category: string; charge: string }[];
  selections?: { id: string; category: string; selectedCount: number; totalCount: number; pendingText: string }[];`;

content = content.replace(search, replace);
fs.writeFileSync('/app/applet/types.ts', content);

const fs = require('fs');
let content = fs.readFileSync('/app/applet/tsconfig.json', 'utf-8');
content = content.replace('"exclude": [', '"exclude": [\n    "dist",');
fs.writeFileSync('/app/applet/tsconfig.json', content);

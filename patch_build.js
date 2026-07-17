const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.build = "NODE_OPTIONS=--max-old-space-size=4096 vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs";
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

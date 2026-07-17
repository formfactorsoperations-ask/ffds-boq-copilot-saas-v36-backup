const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('/app/applet/package.json', 'utf-8'));
pkg.overrides = {
  "node-domexception": "file:./node-domexception-stub"
};
fs.writeFileSync('/app/applet/package.json', JSON.stringify(pkg, null, 2));

const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/client/HandoverDocketPage.tsx', 'utf8');

content = content.replace(
    /\.pdf-generating \{\s*width: 210mm !important;\s*max-width: 210mm !important;\s*padding: 0 !important;\s*\}/g,
    `.pdf-generating {
                    width: 800px !important;
                    max-width: 800px !important;
                    margin: 0 auto;
                }`
);

fs.writeFileSync('/app/applet/components/client/HandoverDocketPage.tsx', content);

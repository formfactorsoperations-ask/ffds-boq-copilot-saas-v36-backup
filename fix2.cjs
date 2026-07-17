const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/client/HandoverDocketPage.tsx', 'utf8');

const regex = /const handleCopy = \([^)]*\) => \{[\s\S]*?const handlePrint = \(\) => \{\s*window\.print\(\);\s*\};/g;
let match;
let matches = [];
while ((match = regex.exec(content)) !== null) {
    matches.push({
        text: match[0],
        index: match.index,
        length: match[0].length
    });
}

if (matches.length > 1) {
    const firstMatch = matches[0];
    content = content.substring(0, firstMatch.index) + content.substring(firstMatch.index + firstMatch.length);
}

fs.writeFileSync('/app/applet/components/client/HandoverDocketPage.tsx', content);

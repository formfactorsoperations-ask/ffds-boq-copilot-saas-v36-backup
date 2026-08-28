const fs = require('fs');
let content = fs.readFileSync('components/PaymentCalculatorTab.tsx', 'utf8');

const importRegex = /import \{ usePageHeader \} from '\.\.\/contexts\/PageHeaderContext'/;
if (!importRegex.test(content)) {
    content = content.replace(/import React, \{ useState, useEffect, useMemo, useRef \} from 'react';/, `import React, { useState, useEffect, useMemo, useRef } from 'react';\nimport { usePageHeader } from '../contexts/PageHeaderContext';`);
    fs.writeFileSync('components/PaymentCalculatorTab.tsx', content, 'utf8');
}

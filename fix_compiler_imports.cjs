const fs = require('fs');

let code = fs.readFileSync('services/weeklyReportCompiler.ts', 'utf8');

// The appended code looks like:
// import { collection, getDocs, doc, getDoc, setDoc, query, orderBy, limit, where } from 'firebase/firestore';
// import { db } from './firebaseClient';
// import { formatINR } from '../lib/utils';
// ... functions

code = code.replace(/import \{ collection, getDocs, doc, getDoc, setDoc, query, orderBy, limit, where \} from 'firebase\/firestore';\n/, '');
code = code.replace(/import \{ db \} from '\.\/firebaseClient';\n/, '');
code = code.replace(/import \{ formatINR \} from '\.\.\/lib\/utils';\n/, '');

// Add missing imports to the top
const topImports = `import { query, orderBy, limit, where } from 'firebase/firestore';
import { formatINR } from '../lib/utils';
`;

code = topImports + code;

fs.writeFileSync('services/weeklyReportCompiler.ts', code);
console.log('Fixed imports in weeklyReportCompiler.ts');

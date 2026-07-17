const fs = require('fs');

let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');
code = code.replace(/import \{ doc, getDoc, collection, getDocs, setDoc, updateDoc \} from 'firebase\/firestore';\n/, '');
fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);

let comp = fs.readFileSync('services/weeklyReportCompiler.ts', 'utf8');
comp = comp.replace(/import \{ dbService \} from '\.\/dbService';\n/, 'import { db as dbService } from \'./dbService\';\n');
fs.writeFileSync('services/weeklyReportCompiler.ts', comp);
console.log('Fixed imports');

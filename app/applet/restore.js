import fs from 'fs';
import path from 'path';

function searchAll(dir, depth = 0) {
    if (depth > 4) return;
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const full = path.join(dir, file);
            if (['node_modules', '.git', 'opt', 'usr', 'lib', 'proc', 'sys', 'dev', 'etc', 'var', 'bin', 'sbin'].includes(file)) continue;
            let stat;
            try { stat = fs.statSync(full); } catch (e) { continue; }
            if (stat.isDirectory()) {
                console.log(' '.repeat(depth * 2) + `[DIR] ${file}`);
                searchAll(full, depth + 1);
            } else {
                console.log(' '.repeat(depth * 2) + `[FILE] ${file} (${stat.size} bytes)`);
            }
        }
    } catch (e) {
        console.log(`Error reading ${dir}: ${e.message}`);
    }
}

console.log('--- Listing from /app ---');
searchAll('/app');

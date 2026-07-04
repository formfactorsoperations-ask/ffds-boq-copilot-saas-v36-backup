const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `            // Parse the stringified JSON to automatically strip any 'undefined' values
            // which are not supported by Firestore.
            let payload: any = JSON.parse(jsonString);`;

const replacement = `            // Create a pre-cleaned project to avoid compressing derived view data
            const cleanProject = { ...project };
            if (cleanProject.tiers) {
                cleanProject.tiers = cleanProject.tiers.map(t => {
                    const newT = { ...t };
                    delete newT.fullBoq;
                    delete newT.groupedBoq;
                    return newT;
                });
            }

            const cleanJsonString = JSON.stringify(cleanProject);
            const sizeBytes = new Blob([cleanJsonString]).size;

            // Parse the stringified JSON to automatically strip any 'undefined' values
            // which are not supported by Firestore.
            let payload: any = JSON.parse(cleanJsonString);`;

code = code.replace(target, replacement);

const target2 = `            const jsonString = JSON.stringify(project);
            const sizeBytes = new Blob([jsonString]).size;`;
code = code.replace(target2, '');

const target3 = `                const compressedString = compressData(project);`;
code = code.replace(target3, `                const compressedString = compressData(cleanProject);`);

fs.writeFileSync('services/dbService.ts', code);
console.log("Patched dbService.ts to strip derived data before compressing");

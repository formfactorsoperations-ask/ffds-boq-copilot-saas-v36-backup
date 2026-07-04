const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                        const leanCompressed = compressData(leanProject);
                        if (leanCompressed) {`;

const replacement = `                        // DEBUG: Find out what's huge
                        for (const key of Object.keys(leanProject)) {
                            const size = new Blob([JSON.stringify(leanProject[key])]).size;
                            if (size > 50000) {
                                console.warn(\`Key \${key} is huge: \${(size/1024).toFixed(2)} KB\`);
                                if (key === 'tiers') {
                                    leanProject.tiers.forEach((t, i) => console.warn(\`  Tier \${i} size: \${(new Blob([JSON.stringify(t)]).size/1024).toFixed(2)} KB\`));
                                } else if (key === 'activeProject' && leanProject.activeProject?.executionData) {
                                     console.warn(\`  ExecutionData size: \${(new Blob([JSON.stringify(leanProject.activeProject.executionData)]).size/1024).toFixed(2)} KB\`);
                                }
                            }
                        }

                        // Remove unused or huge fields
                        // If there are many tiers, only keep the active one and the first one? No that loses data.
                        
                        const leanCompressed = compressData(leanProject);
                        if (leanCompressed) {`;

code = code.replace(target, replacement);
fs.writeFileSync('services/dbService.ts', code);

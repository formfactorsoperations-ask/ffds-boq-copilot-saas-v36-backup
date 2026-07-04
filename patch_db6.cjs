const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                        // Compress lean version
                        // DEBUG: Find out what's huge`;

const replacement = `                        // Aggressively strip any base64 images from anywhere in the project
                        const leanString = JSON.stringify(leanProject, (key, value) => {
                            if (typeof value === 'string' && value.startsWith('data:image/')) {
                                return undefined; // Strip all base64 images
                            }
                            return value;
                        });
                        const superLeanProject = JSON.parse(leanString);

                        // Compress lean version
                        // DEBUG: Find out what's huge`;

code = code.replace(target, replacement);

const target2 = `                        const leanCompressed = compressData(leanProject);`;
const replacement2 = `                        const leanCompressed = compressData(superLeanProject);`;
code = code.replace(target2, replacement2);

fs.writeFileSync('services/dbService.ts', code);

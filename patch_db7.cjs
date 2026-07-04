const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                        if (leanCompressed) {
                            payload = {
                                id: project.id,
                                lastModified: project.lastModified,
                                name: project.context.name,
                                isCompressed: true,
                                compressedData: leanCompressed,
                                warning: "Images stripped due to cloud size limits"
                            };
                        }
                    }
                }
            }

            await setDoc(doc(firestore, "projects", project.id), payload);`;

const replacement = `                        if (leanCompressed) {
                            payload = {
                                id: project.id,
                                lastModified: project.lastModified,
                                name: project.context.name,
                                isCompressed: true,
                                compressedData: leanCompressed,
                                warning: "Images stripped due to cloud size limits"
                            };
                        }
                    }
                }
            }

            if (payload.compressedData && payload.compressedData.length > 1048400) {
                console.error("Payload still too large for Firestore after aggressive stripping!");
                throw new Error("Project data is too large for Cloud Sync. Saved locally only.");
            }

            await setDoc(doc(firestore, "projects", project.id), payload);`;

code = code.replace(target, replacement);
fs.writeFileSync('services/dbService.ts', code);

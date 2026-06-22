
import { FullProjectData, Item } from '../types';
import { db as firestore, isFirebaseConfigured } from './firebaseClient';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc, query, where, serverTimestamp } from 'firebase/firestore';
import pako from 'pako';

// Multi-tenant Helper
const getCurrentTenantId = () => {
    try {
        const saved = localStorage.getItem('ffds_org_context');
        if (saved) {
            const org = JSON.parse(saved);
            return org.tenantId || 'demo-tenant-01';
        }
    } catch(e) {}
    return 'demo-tenant-01';
};

const getTenantDocId = (baseName: string) => {
    const tid = getCurrentTenantId();
    return tid === 'demo-tenant-01' ? baseName : `${baseName}_${tid}`;
};

import { INITIAL_BANK } from '../constants';
import { INITIAL_TEMPLATES, TemplateData } from '../lib/standardPackages';
import { EMAIL_TEMPLATE_LIBRARY } from '../lib/templateEngine';
import { FFDS_TEMPLATES } from '../lib/ffdsTemplates';

// --- CONSTANTS ---
const STORAGE_KEYS = {
    PROJECTS: 'ffds_project_library',
    BANK: 'ffds_item_bank',
    DRAFT_BANK: 'ffds_draft_item_bank',
    TEMPLATES: 'ffds_templates'
};

// --- TYPES ---
export interface DBService {
    isCloud: boolean;
    getProjects: () => Promise<FullProjectData[]>;
    saveProject: (project: FullProjectData) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    getBank: () => Promise<Item[]>;
    saveBank: (bank: Item[]) => Promise<void>;
    getDraftBank: () => Promise<Item[]>;
    saveDraftBank: (bank: Item[]) => Promise<void>;
    getTemplates: () => Promise<TemplateData>;
    saveTemplates: (templates: TemplateData) => Promise<void>;
    seedMasterData: () => Promise<void>;
    seedDefaultTemplates?: (studioId: string) => Promise<void>;
    resetDefaultTemplates?: (studioId: string) => Promise<any>;
    seedRewrittenTemplates?: (studioId: string) => Promise<any>;
    syncLocalToCloud: () => Promise<void>;
    getDebugStats: () => Promise<{ localCount: number; cloudCount: number | null; cloudStatus: string }>;
    saveOrganizationProfile?: (org: any) => Promise<void>;
}

// --- HELPER: COMPRESSION ---
// Uses pako to compress large project payloads
const compressData = (data: any): string | null => {
    try {
        const jsonString = JSON.stringify(data);
        const compressed = pako.deflate(jsonString);
        // Convert Uint8Array to binary string efficiently
        let binary = '';
        const len = compressed.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(compressed[i]);
        }
        return btoa(binary);
    } catch (e) {
        console.warn("Compression logic failed", e);
    }
    return null;
};

const decompressData = (base64: string): any => {
    try {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const decompressed = pako.inflate(bytes, { to: 'string' });
        return JSON.parse(decompressed);
    } catch (e) {
        console.error("Decompression failed", e);
    }
    return null;
};

// --- LOCAL STRATEGY ---
const LocalStrategy: DBService = {
    isCloud: false,
    
    getProjects: async () => {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
            const projects = data ? JSON.parse(data) : [];
            projects.forEach((p: any) => p._wasCompressed = false);
            return projects;
        } catch (e) {
            console.error("Local Load Error", e);
            return [];
        }
    },

    saveProject: async (project) => {
        const projects = await LocalStrategy.getProjects();
        const index = projects.findIndex(p => p.id === project.id);
        if (index >= 0) projects[index] = project;
        else projects.unshift(project);
        
        try {
            localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
        } catch (e: any) {
            if (e.name === 'QuotaExceededError' || e.message?.includes('exceeded the quota')) {
                console.warn("Local storage quota exceeded. Attempting to strip images from ALL projects to save space.");
                
                const leanProjects = projects.map(p => {
                    const leanProject = { ...p };
                    if (leanProject.context) {
                        leanProject.context = { 
                            ...leanProject.context,
                            floorplanImage: undefined,
                            logoImage: undefined
                        };
                        
                        if (leanProject.context.designSummary) {
                            leanProject.context.designSummary = {
                                ...leanProject.context.designSummary,
                                rooms: leanProject.context.designSummary.rooms.map(room => ({
                                    ...room,
                                    views: room.views.map(view => ({
                                        ...view,
                                        image: null
                                    }))
                                }))
                            };
                        }
                    }
                    
                    if ((leanProject as any).renders) {
                        (leanProject as any).renders = (leanProject as any).renders.map((r: any) => ({
                            ...r,
                            imageUrl: ''
                        }));
                    }
                    return leanProject;
                });
                
                try {
                    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(leanProjects));
                } catch (innerError) {
                    console.error("Still exceeding quota even after stripping images from all projects.", innerError);
                    alert("Local storage is full. Please delete some old projects to save new ones.");
                }
            } else {
                console.error("Failed to save to local storage", e);
            }
        }
    },

    deleteProject: async (id) => {
        const projects = await LocalStrategy.getProjects();
        const filtered = projects.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(filtered));
    },

    getBank: async () => {
        const data = localStorage.getItem(STORAGE_KEYS.BANK);
        return data ? JSON.parse(data) : INITIAL_BANK;
    },

    saveBank: async (bank) => {
        localStorage.setItem(STORAGE_KEYS.BANK, JSON.stringify(bank));
    },

    getDraftBank: async () => {
        const data = localStorage.getItem(STORAGE_KEYS.DRAFT_BANK);
        if (data) return JSON.parse(data);
        // Fallback to active bank if no draft exists
        const activeBank = localStorage.getItem(STORAGE_KEYS.BANK);
        return activeBank ? JSON.parse(activeBank) : INITIAL_BANK;
    },

    saveDraftBank: async (bank) => {
        localStorage.setItem(STORAGE_KEYS.DRAFT_BANK, JSON.stringify(bank));
    },

    getTemplates: async () => {
        const data = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
        return data ? JSON.parse(data) : INITIAL_TEMPLATES;
    },

    saveTemplates: async (templates) => {
        localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    },

    seedMasterData: async () => {
        console.log("Seeding not required for local storage.");
    },

    syncLocalToCloud: async () => {
        console.log("Already on local storage.");
    },

    getDebugStats: async () => {
        const projects = await LocalStrategy.getProjects();
        return { localCount: projects.length, cloudCount: null, cloudStatus: 'Disabled' };
    },
    saveOrganizationProfile: async (org: any) => {
        // No-op for local
    }
};

// --- CLOUD STRATEGY (FIREBASE + LOCAL FALLBACK) ---

const handleError = (e: any, context: string) => {
    const msg = e.message || '';
    const code = e.code || '';
    
    if (code === 'unavailable' || msg.includes('offline')) {
        console.warn(`Firestore (${context}) unavailable/offline. Using local defaults.`);
        return 'offline';
    } else if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
        console.warn(`Firestore (${context}) Permission Denied. Using local defaults. (Check Firebase Console > Firestore Database > Rules)`);
        return 'permission';
    } else {
        console.error(`Firestore (${context}) Error:`, e);
        return 'error';
    }
};

const CloudStrategy: DBService = {
    isCloud: true,

    getProjects: async () => {
        if (!firestore) return LocalStrategy.getProjects();
        try {
            const tenantId = getCurrentTenantId();
            let querySnapshot = await getDocs(collection(firestore, "projects"));

            const projects = querySnapshot.docs
                .map(doc => {
                    try {
                        const data = doc.data();
                        // Hydrate compressed projects
                        if (data.compressedData) {
                            const hydrated = decompressData(data.compressedData);
                            if (hydrated) {
                                const projectData = hydrated as FullProjectData;
                                if (!projectData.id) projectData.id = doc.id;
                                
                                // We also need to map the top-level tenantId if it was lost in compression
                                if (data.tenantId && !projectData.tenantId) {
                                    projectData.tenantId = data.tenantId;
                                }
                                
                                // Merge root fields that might have been updated independently of compressed block
                                if (data.communicationLog) (projectData as any).communicationLog = data.communicationLog;
                                if (data.journeySteps) (projectData as any).journeySteps = data.journeySteps;
                                if (data.lastModified) projectData.lastModified = data.lastModified;
                                if (data.context && data.context.journeySummary) {
                                    projectData.context = projectData.context || {} as any;
                                    projectData.context.journeySummary = data.context.journeySummary;
                                }

                                (projectData as any)._wasCompressed = true;
                                return projectData;
                            }
                            
                            console.error(`Failed to hydrate project ${doc.id} - returning safe empty shell`);
                            console.log('Project Document Data:', data);
                            // Return a valid shell to prevent undefined errors in UI
                            return { 
                                id: doc.id, 
                                lastModified: data.lastModified || Date.now(),
                                context: { 
                                    name: data.name || (data.context && data.context.name) || 'Recovered Project', 
                                    location: 'Unknown', 
                                    area: 0, 
                                    config: '', 
                                    rooms: [] 
                                },
                                tiers: [],
                                activeTierId: null,
                                activeProject: null,
                                materials: [],
                                timeline: [],
                                leadProfile: { behaviouralNotes: '', leadLensGhostingScore: 0, leadLensFitScore: 0 },
                                decisionBrainOutput: null,
                                _wasCompressed: true,
                                _failedHydration: true
                            } as FullProjectData; 
                        }
                        
                        const projectData = data as FullProjectData;
                        if (!projectData.id) {
                            projectData.id = doc.id;
                        }
                        (projectData as any)._wasCompressed = false;
                        return projectData;
                    } catch (err) {
                        console.error(`Error mapping project ${doc.id}:`, err);
                        return { id: doc.id, _failedHydration: true, context: { name: 'Error Mapping Project' } } as any;
                    }
                });
            
            // Filter out any projects that are somehow still missing critical arrays (extra safety)
            const validProjects = projects.filter(p => p && p.id);
            
            // Ensure tiers is at least an empty array for all valid projects
            validProjects.forEach(p => {
                if (!p.tiers) p.tiers = [];
            });
            
            return validProjects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
        } catch (e: any) {
            handleError(e, 'Fetch Projects');
            return LocalStrategy.getProjects();
        }
    },

    saveProject: async (project) => {
        // 1. Always backup to local first (Zero Data Loss Policy)
        await LocalStrategy.saveProject(project);
        
        if (!firestore) return;
        
        try {
            // 2. Prepare Payload
            // Firestore Limit: 1 MB (1,048,576 bytes)
            const jsonString = JSON.stringify(project);
            const sizeBytes = new Blob([jsonString]).size;
            
            // Parse the stringified JSON to automatically strip any 'undefined' values
            // which are not supported by Firestore.
            let payload: any = JSON.parse(jsonString);
            payload.tenantId = getCurrentTenantId();
            
            // 3. Compression Trigger (at 800KB)
            if (sizeBytes > 800000) {
                console.log(`Project ${project.id} size (${(sizeBytes/1024).toFixed(0)}KB) exceeds threshold. Compressing...`);
                
                const compressedString = compressData(project);
                
                if (compressedString) {
                    payload = {
                        id: project.id,
                        tenantId: getCurrentTenantId(),
                        lastModified: project.lastModified,
                        name: project.context.name, // Metadata for listing without decompressing
                        isCompressed: true,
                        compressedData: compressedString
                    };
                    
                    // Verify compressed size
                    const compSize = new Blob([JSON.stringify(payload)]).size;
                    
                    // 4. Emergency Fallback: Strip Images if still too big (> 1MB)
                    if (compSize > 1000000) {
                        console.warn(`Compressed project still too large (${(compSize/1024).toFixed(0)}KB). Stripping images for Cloud backup.`);
                        
                        // Create a lean version without heavy images
                        const leanProject = { ...project };
                        if (leanProject.context) {
                            leanProject.context = { 
                                ...leanProject.context,
                                floorplanImage: undefined,
                                logoImage: undefined
                            };
                        }
                        
                        // Also strip generated renders images if they exist to save space
                        if ((leanProject as any).renders) {
                            (leanProject as any).renders = (leanProject as any).renders.map((r: any) => ({
                                ...r,
                                imageUrl: '' // Strip the heavy base64 to allow cloud save
                            }));
                        }

                        // Strip Design Summary images
                        if (leanProject.context && leanProject.context.designSummary) {
                            leanProject.context = {
                                ...leanProject.context,
                                designSummary: {
                                    ...leanProject.context.designSummary,
                                    rooms: leanProject.context.designSummary.rooms.map(room => ({
                                        ...room,
                                        views: room.views.map(view => ({
                                            ...view,
                                            image: null // Strip heavy base64
                                        }))
                                    }))
                                }
                            };
                        }
                        
                        // Compress lean version
                        const leanCompressed = compressData(leanProject);
                        if (leanCompressed) {
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

            await setDoc(doc(firestore, "projects", project.id), payload);
            
        } catch (e: any) {
            handleError(e, 'Save Project');
        }
    },

    deleteProject: async (id) => {
        await LocalStrategy.deleteProject(id);
        
        if (!firestore) return;
        try {
            await deleteDoc(doc(firestore, "projects", id));
        } catch (e: any) {
            handleError(e, 'Delete Project');
        }
    },

    getBank: async () => {
        if (!firestore) return LocalStrategy.getBank();
        try {
            const docRef = doc(firestore, "master_data", getTenantDocId("item_bank"));
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return (docSnap.data() as any).items as Item[];
            } else {
                try {
                    await setDoc(docRef, { items: INITIAL_BANK, updatedAt: Date.now() });
                } catch (seedError) { }
                return INITIAL_BANK;
            }
        } catch (e: any) {
            handleError(e, 'Fetch Bank');
            return LocalStrategy.getBank();
        }
    },

    saveBank: async (bank) => {
        await LocalStrategy.saveBank(bank);
        
        if (!firestore) return;
        try {
            const cleanBank = JSON.parse(JSON.stringify(bank));
            await setDoc(doc(firestore, "master_data", getTenantDocId("item_bank")), { items: cleanBank, updatedAt: Date.now() });
        } catch (e: any) {
            handleError(e, 'Save Bank');
        }
    },

    getDraftBank: async () => {
        if (!firestore) return LocalStrategy.getDraftBank();
        try {
            const docRef = doc(firestore, "master_data", getTenantDocId("draft_item_bank"));
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return (docSnap.data() as any).items as Item[];
            } else {
                // Initial fallback to cloud active bank
                return await CloudStrategy.getBank();
            }
        } catch (e: any) {
            handleError(e, 'Fetch Draft Bank');
            return LocalStrategy.getDraftBank();
        }
    },

    saveDraftBank: async (bank) => {
        await LocalStrategy.saveDraftBank(bank);
        
        if (!firestore) return;
        try {
            const cleanBank = JSON.parse(JSON.stringify(bank));
            await setDoc(doc(firestore, "master_data", getTenantDocId("draft_item_bank")), { items: cleanBank, updatedAt: Date.now() });
        } catch (e: any) {
            handleError(e, 'Save Draft Bank');
        }
    },

    getTemplates: async () => {
        if (!firestore) return LocalStrategy.getTemplates();
        try {
            const docRef = doc(firestore, "master_data", getTenantDocId("templates"));
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return (docSnap.data() as any).templates as TemplateData;
            } else {
                try {
                    await setDoc(docRef, { templates: INITIAL_TEMPLATES, updatedAt: Date.now() });
                } catch (seedError) { }
                return INITIAL_TEMPLATES;
            }
        } catch (e: any) {
            handleError(e, 'Fetch Templates');
            return LocalStrategy.getTemplates();
        }
    },

    saveTemplates: async (templates) => {
        await LocalStrategy.saveTemplates(templates);
        
        if (!firestore) return;
        try {
            const cleanTemplates = JSON.parse(JSON.stringify(templates));
            await setDoc(doc(firestore, "master_data", getTenantDocId("templates")), { templates: cleanTemplates, updatedAt: Date.now() });
        } catch (e: any) {
            handleError(e, 'Save Templates');
        }
    },

    seedMasterData: async () => {
        if (!firestore) return;
        try {
            console.log("Seeding Item Bank...");
            await setDoc(doc(firestore, "master_data", getTenantDocId("item_bank")), { 
                items: INITIAL_BANK, 
                updatedAt: Date.now() 
            });
            
            console.log("Seeding Templates...");
            await setDoc(doc(firestore, "master_data", getTenantDocId("templates")), { 
                templates: INITIAL_TEMPLATES, 
                updatedAt: Date.now() 
            });
            
            console.log("Success! Hardcoded Bank & Templates uploaded to Firebase.");
        } catch (e: any) {
            handleError(e, 'Seed Master Data');
            console.error("Failed to seed data. Check console permissions.");
        }
    },

    syncLocalToCloud: async () => {
        if (!firestore) return;
        try {
            const localProjects = await LocalStrategy.getProjects();
            
            if (localProjects.length === 0) {
                console.log("No local projects found to sync.");
                return;
            }

            console.log(`Found ${localProjects.length} local projects. Uploading to Cloud...`);
            let count = 0;
            
            for (const p of localProjects) {
                if (p.id) {
                    await CloudStrategy.saveProject(p);
                    count++;
                }
            }
            
            console.log(`Migration Complete! ${count} Projects uploaded to Firebase.`);
        } catch (e: any) {
            handleError(e, 'Sync Local Projects');
            console.error("Failed to sync projects. Check console for details.");
        }
    },

    getDebugStats: async () => {
        // Always fetch local count
        const localProjects = await LocalStrategy.getProjects();
        const localCount = localProjects.length;
        
        let cloudCount = null;
        let cloudStatus = 'Disconnected';

        if (firestore) {
            try {
                // Check connection and count
                const querySnapshot = await getDocs(collection(firestore, "projects"));
                cloudCount = querySnapshot.size;
                cloudStatus = 'Connected';
            } catch (e: any) {
                const type = handleError(e, 'Stats Check');
                cloudStatus = type === 'permission' ? 'Permission Denied' : 'Connection Error';
            }
        }
        
        return { localCount, cloudCount, cloudStatus };
    },
    
    saveOrganizationProfile: async (org: any) => {
        if (!firestore) return;
        try {
            const tenantId = org.tenantId;
            if (tenantId && tenantId !== 'demo-tenant-01') {
                await setDoc(doc(firestore, "organizations", tenantId), org);
            }
        } catch(e) {
            console.error("Failed to save org", e);
        }
    },
    
    seedDefaultTemplates: async (studioId: string) => {
        if (!firestore) return;
        try {
            const docRef = doc(firestore, `studios/${studioId}/settings/main`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (!data.emailTemplateLibrary || data.emailTemplateLibrary.length === 0) {
                    await setDoc(docRef, { emailTemplateLibrary: EMAIL_TEMPLATE_LIBRARY }, { merge: true });
                }
            } else {
                await setDoc(docRef, { emailTemplateLibrary: EMAIL_TEMPLATE_LIBRARY }, { merge: true });
            }
        } catch(e) {
            console.error("Failed to seed templates", e);
        }
    },
    
    resetDefaultTemplates: async (studioId: string) => {
        if (!firestore) return;
        try {
            const docRef = doc(firestore, `studios/${studioId}/settings/main`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const existing = data.emailTemplateLibrary || [];
                const merged = EMAIL_TEMPLATE_LIBRARY.map(defaultTpl => {
                    const found = existing.find((e: any) => e.key === defaultTpl.key);
                    if (found && found.isCustomised) {
                        return found;
                    }
                    return defaultTpl;
                });
                await setDoc(docRef, { emailTemplateLibrary: merged }, { merge: true });
                return merged;
            }
        } catch(e) {
            console.error("Failed to reset templates", e);
            throw e;
        }
    },

    seedRewrittenTemplates: async (studioId: string) => {
        if (!firestore) return;
        try {
            const docRef = doc(firestore, `studios/${studioId}/settings/main`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const existing = data.emailTemplateLibrary || [];
                
                const updated = existing.map((tpl: any) => {
                    if (tpl.isCustomised) return tpl;
                    
                    const ffdsData = FFDS_TEMPLATES[tpl.key];
                    if (!ffdsData) return tpl; // If not one of the new FFDS templates, leave it alone
                    
                    return {
                        ...tpl,
                        email: {
                            subject: ffdsData.subject,
                            body: ffdsData.emailBody
                        },
                        whatsapp: {
                            body: ffdsData.whatsappBody
                        }
                    };
                });
                
                await setDoc(docRef, { 
                    emailTemplateLibrary: updated,
                    lastSeededAt: serverTimestamp() 
                }, { merge: true });
                
                return updated;
            }
        } catch(e) {
            console.error("Failed to seed rewritten templates", e);
            throw e;
        }
    }
};

// --- EXPORTED INSTANCE ---
export const db = isFirebaseConfigured() ? CloudStrategy : LocalStrategy;

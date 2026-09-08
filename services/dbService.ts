
import { FullProjectData, Item , ProjectLifecycle, Vendor, PurchaseOrder, Observation, ProjectSchedule } from '../types';
import { db as firestore, isFirebaseConfigured } from './firebaseClient';
import { auditDb } from './dbAudit';
import { collection, getDocs, writeBatch, doc, setDoc, deleteDoc, getDoc, query, where, serverTimestamp } from 'firebase/firestore';
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
import { get, set, del } from "idb-keyval";

// --- CONSTANTS ---
const STORAGE_KEYS = {
    PROJECTS: 'ffds_project_library',
    BANK: 'ffds_item_bank',
    DRAFT_BANK: 'ffds_draft_item_bank',
    TEMPLATES: 'ffds_templates',
    VENDORS: 'ffds_vendors',
    OBSERVATIONS: 'ffds_observations',
    SCHEDULE: 'ffds_schedule',
};

// --- TYPES ---
export interface DBService {
    isCloud: boolean;
    getProjects: () => Promise<FullProjectData[]>;
    saveProject: (project: FullProjectData) => Promise<void>;
    upgradeLegacyProject: (project: FullProjectData) => Promise<void>;
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
    getVendors: () => Promise<Vendor[]>;
    saveVendors: (vendors: Vendor[]) => Promise<void>;
    getPurchaseOrders: (projectId: string) => Promise<PurchaseOrder[]>;
    savePurchaseOrders: (projectId: string, pos: PurchaseOrder[]) => Promise<void>;
    getObservations: () => Promise<Observation[]>;
    saveObservations: (observations: Observation[]) => Promise<void>;
    getSchedule: (projectId: string) => Promise<ProjectSchedule | null>;
    saveSchedule: (projectId: string, schedule: ProjectSchedule) => Promise<void>;
    deleteSchedule?: (projectId: string) => Promise<void>;
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
            let data = await get(STORAGE_KEYS.PROJECTS);
            if (data === undefined) {
                data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
                if (data) {
                    // Migrate to idb
                    await set(STORAGE_KEYS.PROJECTS, data);
                    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
                }
            }

            let projects = [];
            if (data) {
                if (data.trim().startsWith('[') || data.trim().startsWith('{')) {
                    projects = JSON.parse(data);
                } else {
                    projects = decompressData(data) || [];
                }
            }
            projects.forEach((p: any) => p._wasCompressed = false);
            return projects;
        } catch (e) {
            console.error("Local Load Error", e);
            return [];
        }
    },

    
    upgradeLegacyProject: async (project: FullProjectData) => {
        if (!firestore) return;
        const tenantId = getCurrentTenantId();
        
        // 1. Mark as canonical and map legacy status to lifecycle
        let stage: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1;
        
        // Check if there's a legacy currentStage number, or if it already has a lifecycle stage
        const legacyStageNum = project.context?.lifecycle?.stage || (project as any).currentStage || project.context?.currentStage;
        
        let st = project.context?.status?.toLowerCase() || 'lead';
        // Normalize status strings if they are weird
        if (st.includes('execution')) st = 'execution';
        if (st.includes('completed') || st.includes('handover')) st = 'completed';
        if (st.includes('won')) st = 'won';
        
        if (typeof legacyStageNum === 'number' && legacyStageNum >= 1 && legacyStageNum <= 7) {
            stage = legacyStageNum as (1|2|3|4|5|6|7);
            // Overwrite status string based on the legacy stage number to keep them in sync
            if (stage === 1) {
                if (!['lead', 'draft', 'proposal_sent', 'negotiation', 'lost'].includes(st)) st = 'lead';
            } else if (stage >= 2 && stage <= 5) {
                st = 'won';
            } else if (stage === 6) {
                if (st !== 'work_paused') st = 'execution';
            } else if (stage >= 7) {
                st = 'completed';
            }
        } else {
            if (['lead', 'draft', 'proposal_sent', 'negotiation'].includes(st)) stage = 1;
            else if (st === 'won') stage = 2;
            else if (st === 'execution' || st === 'work_paused') stage = 6;
            else if (st === 'completed') stage = 7;
            else if (st === 'lost') stage = 1;
        }

        const now = Date.now();
        const existingLifecycle: any = project.context?.lifecycle || {};
        
        // Force update the stage and gates based on the computed logic
        const updatedLifecycle: ProjectLifecycle = {
            ...existingLifecycle,
            stage,
            subState: st === 'lost' ? 'Lost' : (existingLifecycle.subState || 'Migrated from legacy'),
            enteredStageAt: existingLifecycle.enteredStageAt || now,
            gates: {
                ...(existingLifecycle.gates || {}),
                proposalAccepted: { 
                    done: existingLifecycle.gates?.proposalAccepted?.done || stage >= 2, 
                    at: existingLifecycle.gates?.proposalAccepted?.at || now, 
                    reference: existingLifecycle.gates?.proposalAccepted?.reference || 'legacy' 
                },
                contractSigned: { 
                    done: existingLifecycle.gates?.contractSigned?.done || stage >= 4, 
                    at: existingLifecycle.gates?.contractSigned?.at || now, 
                    reference: existingLifecycle.gates?.contractSigned?.reference || 'legacy' 
                },
                designGateActive: { 
                    done: existingLifecycle.gates?.designGateActive?.done || stage >= 5, 
                    at: existingLifecycle.gates?.designGateActive?.at || now, 
                    reference: existingLifecycle.gates?.designGateActive?.reference || 'legacy' 
                },
                handoverComplete: { 
                    done: existingLifecycle.gates?.handoverComplete?.done || stage >= 6, 
                    at: existingLifecycle.gates?.handoverComplete?.at || now, 
                    reference: existingLifecycle.gates?.handoverComplete?.reference || 'legacy' 
                }
            },
            updatedAt: now
        };

        // Ensure documents are unlocked according to the stage
        let proposalDecision = project.context?.proposalDecision;
        let designAgreementSignoff = project.context?.designAgreementSignoff;
        if (stage >= 2) {
            if (!proposalDecision || !proposalDecision.selected) {
                proposalDecision = {
                    ...proposalDecision,
                    enabled: true,
                    selected: project.activeTierId || "legacy_accepted",
                    options: proposalDecision?.options || []
                };
            }
            if (!designAgreementSignoff || designAgreementSignoff.status !== 'signed') {
                designAgreementSignoff = {
                    status: 'signed',
                    signedAt: now,
                    clientName: project.context?.clientName || 'Legacy Client',
                };
            }
        }

        let contractSignoff = project.context?.contractSignoff;
        if (stage >= 4) {
            if (!contractSignoff || contractSignoff.status !== 'signed') {
                contractSignoff = {
                    status: 'signed',
                    signedAt: now,
                    signedBy: project.context?.clientName || 'Legacy Client',
                };
            }
        }

        let handoverSignoff = project.context?.handoverSignoff;
        if (stage >= 6) {
            if (!handoverSignoff || handoverSignoff.status !== 'signed') {
                handoverSignoff = {
                    status: 'signed',
                    signedAt: now,
                    clientName: project.context?.clientName || 'Legacy Client',
                };
            }
        }

        const updatedProject: FullProjectData = { 
            ...project, 
            architecture: 'canonical' as const,
            context: {
                ...project.context,
                lifecycle: updatedLifecycle,
                status: st as any,
                proposalDecision,
                designAgreementSignoff,
                contractSignoff,
                handoverSignoff,
            }
        };
        await CloudStrategy.saveProject(updatedProject);
        
        // 2. Sync BOQ items to subcollection
        const sortedTiers = [...(project.tiers || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const tier = sortedTiers.find(t => t.id === project.activeTierId) || sortedTiers[0];
        
        if (tier && tier.boq && tier.boq.length > 0) {
            const batch = writeBatch(firestore);
            let count = 0;
            for (const item of tier.boq) {
                const itemRef = doc(firestore, `organizations/${tenantId}/projects/${project.id}/boqItems`, item.id);
                batch.set(itemRef, { ...item, _migratedAt: Date.now() });
                count++;
                if (count >= 490) break; // Firestore batch limit is 500
            }
            if (count > 0) {
                await batch.commit();
            }
        }
    },

    saveProject: async (project) => {
        const projects = await LocalStrategy.getProjects();
        
        // Strip heavy derived data before saving locally
        const cleanProject = { ...project };
        if (cleanProject.tiers) {
            cleanProject.tiers = cleanProject.tiers.map(t => {
                const newT = { ...t };
                delete (newT as any).fullBoq;
                delete (newT as any).groupedBoq;
                if ((newT as any).projectContext) {
                    (newT as any).projectContext = leanTierContext((newT as any).projectContext);
                }
                return newT;
            });
        }

        const index = projects.findIndex(p => p.id === cleanProject.id);
        if (index >= 0) projects[index] = cleanProject;
        else projects.unshift(cleanProject);
        
        // Ensure all projects are stripped of derived data
        const cleanProjects = projects.map(p => {
            if (p.tiers) {
                p.tiers = p.tiers.map(t => {
                    const newT = { ...t };
                    delete (newT as any).fullBoq;
                    delete (newT as any).groupedBoq;
                    return newT;
                });
            }
            return p;
        });
        
        try {
            await set(STORAGE_KEYS.PROJECTS, JSON.stringify(cleanProjects));
        } catch (e: any) {
            if (e.name === 'QuotaExceededError' || e.message?.includes('exceeded the quota')) {
                console.warn("Local storage quota exceeded. Attempting to strip images from ALL projects to save space.");
                
                const leanProjects = cleanProjects.map(p => {
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
                    await set(STORAGE_KEYS.PROJECTS, JSON.stringify(leanProjects));
                } catch (innerError) {
                    console.warn("Still exceeding quota. Compressing all local projects...");
                    try {
                        const compressed = compressData(leanProjects);
                        if (compressed) {
                            await set(STORAGE_KEYS.PROJECTS, compressed);
                        } else {
                            throw new Error("Compression failed");
                        }
                    } catch (compressionError) {
                        console.error("Compression also exceeded quota or failed.", compressionError);
                        if (isFirebaseConfigured()) {
                            console.warn("Firebase connected. Safely clearing older local projects...");
                            try {
                                let sliced = leanProjects.slice(0, 3);
                                const compressedSliced = compressData(sliced) || JSON.stringify(sliced);
                                await set(STORAGE_KEYS.PROJECTS, compressedSliced);
                            } catch(e3) {
                                try {
                                    const top1 = [leanProjects[0]];
                                    await set(STORAGE_KEYS.PROJECTS, compressData(top1) || JSON.stringify(top1));
                                } catch(e4) {
                                    alert("Local storage is critically full. Please clear your browser cache/data.");
                                }
                            }
                        } else {
                            alert("Local storage is full. Please delete some old projects to save new ones.");
                        }
                    }
                }
            } else {
                console.error("Failed to save to local storage", e);
            }
        }
    },

    deleteProject: async (id) => {
        const projects = await LocalStrategy.getProjects();
        const filtered = projects.filter(p => p.id !== id);
        await set(STORAGE_KEYS.PROJECTS, JSON.stringify(filtered));
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
    },
    getVendors: async () => {
        const data = localStorage.getItem(STORAGE_KEYS.VENDORS);
        return data ? JSON.parse(data) : [];
    },
    saveVendors: async (vendors) => {
        localStorage.setItem(STORAGE_KEYS.VENDORS, JSON.stringify(vendors));
    },
    getPurchaseOrders: async (projectId) => {
        if (!projectId) return [];
        const raw = await get(poKey(projectId));
        return raw ? JSON.parse(raw) : [];
    },
    savePurchaseOrders: async (projectId, pos) => {
        if (!projectId) return;
        await set(poKey(projectId), JSON.stringify(pos));
    },
    getObservations: async () => {
        const raw = await get(STORAGE_KEYS.OBSERVATIONS);
        return raw ? JSON.parse(raw) : [];
    },
    saveObservations: async (observations) => {
        await set(STORAGE_KEYS.OBSERVATIONS, JSON.stringify(observations));
    },
    getSchedule: async (projectId) => {
        if (!projectId) return null;
        const raw = await get(scheduleKey(projectId));
        return raw ? JSON.parse(raw) : null;
    },
    saveSchedule: async (projectId, schedule) => {
        if (!projectId) return;
        const clean = {
            tasks: schedule.tasks || [],
            holds: schedule.holds || [],
            calendar: schedule.calendar,
            baselineAt: schedule.baselineAt ?? null,
            targetHandoverISO: schedule.targetHandoverISO || undefined,
            projectStartISO: schedule.projectStartISO || undefined,
        };
        await set(scheduleKey(projectId), JSON.stringify(clean));
    },
    deleteSchedule: async (projectId) => {
        if (!projectId) return;
        await del(scheduleKey(projectId));
    }
};

const poKey = (projectId: string) => `ffds_pos_${projectId}`;
const scheduleKey = (projectId: string) => `ffds_schedule_${projectId}`;


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

/*
  Tier BOQs live in their own documents.

  A project document carries everything: context, tiers, execution data. The
  BOQ line items are by far the largest part of it — on a live project, 443KB of
  a 699KB payload — and Firestore stops at 1 MiB. The save used to cope by
  throwing scope away: first the BOQs of superseded versions, then the versions
  themselves, silently and permanently.

  Each tier's lines are written to projects/{projectId}/tierBoq/{tierId}
  instead, so the project document grows with the number of versions rather than
  the size of them, and no amount of scope can push a version out of existence.

  The lines are still written inline as well while they fit. That keeps every
  existing reader working unchanged, and means the subcollection is a safety net
  before it is a dependency — nothing breaks if a project has not been saved
  since this arrived.
*/
/*
  A version's context snapshot, reduced to what is actually read from it.

  Approving an annexure stored `projectContext: { ...projectContext }` on the
  new tier — a complete copy of the project's context, 434KB of it on a live
  project, duplicated again for every version approved. Two annexures alone
  accounted for 865KB of an 1,045KB document, against a Firestore limit of
  1,048KB. The project was three kilobytes from the point where the save blanks
  its own cloud copy.

  Only two things ever read it: ClientTab falls back to it when no live context
  is passed, and InternalComparisonTable takes the room names for column order.
  Neither needs the engagement document, the history log, the payment schedules
  or the terms dockets, which is nearly all of the weight.
*/
function leanTierContext(ctx: any): any {
    if (!ctx || typeof ctx !== 'object') return ctx;
    return {
        name: ctx.name,
        clientName: ctx.clientName,
        area: ctx.area,
        config: ctx.config,
        rooms: ctx.rooms,
        approvedTierId: ctx.approvedTierId,
        gstRate: ctx.gstRate,
    };
}

/**
 * Decode a raw `projects/{id}` document into a project.
 *
 * The same handling getProjects does, exposed because App subscribes to the
 * open project and has to read what arrives. A project of any size is stored
 * deflated in `compressedData`, so a snapshot is not usable as-is.
 *
 * Returns null rather than throwing: a document that cannot be decoded is a
 * document to ignore, not one to crash the open project over.
 */
export function projectFromDoc(id: string, data: any): any | null {
    if (!data) return null;
    try {
        if (data.isCompressed && data.compressedData) {
            const decoded = decompressData(data.compressedData);
            return decoded ? { ...decoded, id } : null;
        }
        return { ...data, id };
    } catch {
        return null;
    }
}

const TIER_BOQ_COLLECTION = 'tierBoq';

/*
  Auto-save fires every couple of seconds while a project is open, and a tier's
  lines rarely change between two of them. This remembers what was last written
  for each tier so unchanged ones are skipped, which keeps a background save from
  rewriting several hundred KB on every keystroke.

  Keyed by project and tier, and only ever a cache: a miss costs one extra write.
*/
const lastWrittenTierBoq = new Map<string, string>();

/*
  The engagement record lives in its own document.

  It holds the locked terms snapshot, the payment structure and the agreement's
  own history — 359KB on a live project here, the single largest thing in a
  document Firestore caps at 1 MiB. It is also read rarely: the agreement
  screens, and the legacy fallback that synthesises a Terms of Engagement for
  projects predating the issue model.

  Same arrangement as tier BOQs. Always written here, so it cannot be lost;
  still written inline while the project fits, so every existing reader carries
  on unchanged; and dropped from the inline copy only when the document would
  otherwise be too large to save at all.
*/
const ENGAGEMENT_COLLECTION = 'engagement';
const ENGAGEMENT_DOC = 'current';

/** As with tier BOQs: skip an unchanged record rather than rewrite it every save. */
const lastWrittenEngagement = new Map<string, string>();

async function writeEngagement(projectId: string, engagement: any): Promise<void> {
    if (!firestore || !projectId || !engagement) return;
    const serialised = JSON.stringify(engagement);
    if (lastWrittenEngagement.get(projectId) === serialised) return;

    try {
        await setDoc(doc(firestore, 'projects', projectId, ENGAGEMENT_COLLECTION, ENGAGEMENT_DOC), {
            updatedAt: Date.now(),
            engagement,
        });
        lastWrittenEngagement.set(projectId, serialised);
    } catch (e) {
        lastWrittenEngagement.delete(projectId);
        console.warn(`Could not write the engagement record for project ${projectId}`, e);
    }
}

async function writeTierBoqs(projectId: string, tiers: any[]): Promise<void> {
    if (!firestore || !projectId || !tiers?.length) return;

    const pending = tiers.filter(t => t?.id && Array.isArray(t.boq));
    if (!pending.length) return;

    try {
        let batch = writeBatch(firestore);
        let queued = 0;

        for (const tier of pending) {
            const cacheKey = `${projectId}/${tier.id}`;
            const serialised = JSON.stringify(tier.boq);
            if (lastWrittenTierBoq.get(cacheKey) === serialised) continue;

            batch.set(doc(firestore, 'projects', projectId, TIER_BOQ_COLLECTION, tier.id), {
                tierId: tier.id,
                itemCount: tier.boq.length,
                updatedAt: Date.now(),
                boq: tier.boq,
            });
            lastWrittenTierBoq.set(cacheKey, serialised);
            queued++;

            // Firestore caps a batch at 500 writes; tiers will never approach
            // that, but committing in chunks keeps this honest if they do.
            if (queued % 400 === 0) {
                await batch.commit();
                batch = writeBatch(firestore);
            }
        }

        if (queued % 400 !== 0 && queued > 0) await batch.commit();
    } catch (e) {
        /*
          Never fatal. The lines are also inline in the project document (while
          they fit) and in the local copy, so a failure here loses nothing that
          is not already stored elsewhere — but the cache must forget, or the
          next save would skip these tiers believing they were written.
        */
        pending.forEach(t => lastWrittenTierBoq.delete(`${projectId}/${t.id}`));
        console.warn(`Could not write tier BOQs for project ${projectId}`, e);
    }
}

/**
 * Fill in any tier whose lines were left out of the project document.
 *
 * Called when a project is opened. Tiers that still carry their lines inline are
 * left alone, so this is a no-op for everything that fits — and for anything
 * that does not, it is what makes the version history complete again.
 */
export async function hydrateProjectDetail(project: FullProjectData): Promise<FullProjectData> {
    if (!firestore || !project?.id) return project;

    let next = project;

    /*
      The engagement record, if it was left out of the project document. A
      project that never had one simply has no document here, so the miss costs
      one read and changes nothing.
    */
    if (!(next.context as any)?.engagement) {
        try {
            const snap = await getDoc(doc(firestore, 'projects', next.id, ENGAGEMENT_COLLECTION, ENGAGEMENT_DOC));
            const stored = snap.exists() ? (snap.data() as any)?.engagement : null;
            if (stored) next = { ...next, context: { ...(next.context as any), engagement: stored } };
        } catch (e) {
            console.warn(`Could not restore the engagement record for project ${next.id}`, e);
        }
    }

    return hydrateTierBoqs(next);
}

export async function hydrateTierBoqs(project: FullProjectData): Promise<FullProjectData> {
    if (!firestore || !project?.id || !project.tiers?.length) return project;

    const needsLines = project.tiers.filter((t: any) => t?.id && !(t.boq?.length));
    if (!needsLines.length) return project;

    try {
        const fetched = await Promise.all(
            needsLines.map(async (tier: any) => {
                const snap = await getDoc(doc(firestore!, 'projects', project.id, TIER_BOQ_COLLECTION, tier.id));
                return { id: tier.id, boq: snap.exists() ? (snap.data() as any)?.boq || [] : null };
            }),
        );

        const byId = new Map(fetched.filter(f => f.boq !== null).map(f => [f.id, f.boq as any[]]));
        if (!byId.size) return project;

        return {
            ...project,
            tiers: project.tiers.map((t: any) =>
                byId.has(t.id) ? { ...t, boq: byId.get(t.id), boqTrimmed: false } : t),
        };
    } catch (e) {
        // The project still opens, just without the trimmed versions' detail.
        console.warn(`Could not restore tier BOQs for project ${project.id}`, e);
        return project;
    }
}

const CloudStrategy: DBService = {
    upgradeLegacyProject: LocalStrategy.upgradeLegacyProject,
    isCloud: true,

    getProjects: async () => {
        if (!firestore) return LocalStrategy.getProjects();
        try {
            const tenantId = getCurrentTenantId();
            
            let globalDocs: any[] = [];
            let tenantDocs: any[] = [];

            let globalFailed = false;
            try {
                const globalSnapshot = await getDocs(collection(firestore, "projects"));
                globalDocs = globalSnapshot.docs;
            } catch (e) {
                globalFailed = true;
                console.warn("Failed to fetch global projects", e);
            }

            let tenantFailed = false;
            try {
                const tenantSnapshot = await getDocs(collection(firestore, "organizations", tenantId, "projects"));
                tenantDocs = tenantSnapshot.docs;
            } catch (e) {
                tenantFailed = true;
                console.warn(`Failed to fetch tenant projects for tenant ${tenantId}`, e);
            }

            /*
              If neither read succeeded, fall back to the local copy rather than
              reporting an empty library.

              Both failures were only warned about, and the empty result was
              returned as though it were the truth — so a permission denial, a
              dropped connection or an expired session silently emptied the
              user's project list while every project sat intact in IndexedDB.
              An unavailable remote is not the same as "you have no projects".
            */
            if (globalFailed && tenantFailed) {
                const local = await LocalStrategy.getProjects();
                if (local.length > 0) {
                    console.warn(`Remote projects unavailable — showing ${local.length} from this device instead.`);
                    return local;
                }
            }

            const mapDocToProject = (doc: any) => {
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
                        } as unknown as FullProjectData; 
                    }
                    
                    const projectData = data as FullProjectData;
                    if (!projectData.id) {
                        projectData.id = doc.id;
                    }
                    if (!projectData.context) {
                        projectData.context = {} as any;
                    }
                    if (!projectData.context.name && (data.name || (data.context && data.context.name))) {
                        projectData.context.name = data.name || (data.context && data.context.name);
                    }
                    if (!projectData.context.status && (data.status || (data.context && data.context.status))) {
                        projectData.context.status = data.status || (data.context && data.context.status);
                    }
                    (projectData as any)._wasCompressed = false;
                    return projectData;
                } catch (err) {
                    console.error(`Error mapping project ${doc.id}:`, err);
                    return { id: doc.id, _failedHydration: true, context: { name: 'Error Mapping Project' } } as any;
                }
            };

            const globalProjects = globalDocs.map(mapDocToProject);
            const tenantProjects = tenantDocs.map(mapDocToProject);

            const smartMergeProjects = (globalProj: FullProjectData, tenantProj: FullProjectData): FullProjectData => {
                const merged = { ...globalProj };

                if (tenantProj.tenantId) merged.tenantId = tenantProj.tenantId;
                if (tenantProj.architecture) merged.architecture = tenantProj.architecture;
                
                merged.lastModified = Math.max(globalProj.lastModified || 0, tenantProj.lastModified || 0);

                if (globalProj.context && tenantProj.context) {
                    merged.context = {
                        ...globalProj.context,
                        ...tenantProj.context,
                        lifecycle: {
                            ...globalProj.context.lifecycle,
                            ...tenantProj.context.lifecycle
                        }
                    };
                    merged.context.status = tenantProj.context.status || globalProj.context.status || (tenantProj as any).status || (globalProj as any).status;
                } else if (tenantProj.context) {
                    merged.context = { ...tenantProj.context };
                }

                if ((tenantProj as any).status) {
                    (merged as any).status = (tenantProj as any).status;
                }

                if (tenantProj.activeProject) {
                    merged.activeProject = {
                        ...globalProj.activeProject,
                        ...tenantProj.activeProject
                    };
                }

                if (tenantProj.tiers && tenantProj.tiers.length > 0) merged.tiers = tenantProj.tiers;
                if (tenantProj.materials && tenantProj.materials.length > 0) merged.materials = tenantProj.materials;
                if (tenantProj.timeline && tenantProj.timeline.length > 0) merged.timeline = tenantProj.timeline;
                if (tenantProj.leadProfile) merged.leadProfile = { ...globalProj.leadProfile, ...tenantProj.leadProfile };
                if (tenantProj.decisionBrainOutput) merged.decisionBrainOutput = { ...globalProj.decisionBrainOutput, ...tenantProj.decisionBrainOutput };

                if (!merged.context?.name && ((tenantProj as any).name || (globalProj as any).name)) {
                    merged.context = merged.context || {} as any;
                    merged.context.name = (tenantProj as any).name || (globalProj as any).name;
                }

                return merged;
            };

            const mergedMap = new Map<string, FullProjectData>();
            
            // Add global projects first
            globalProjects.forEach(p => {
                if (p && p.id) {
                    mergedMap.set(p.id, p);
                }
            });

            // Add tenant projects with smart merge
            tenantProjects.forEach(p => {
                if (p && p.id) {
                    const existing = mergedMap.get(p.id);
                    if (!existing) {
                        mergedMap.set(p.id, p);
                    } else {
                        const mergedProj = smartMergeProjects(existing, p);
                        mergedMap.set(p.id, mergedProj);
                    }
                }
            });

            const validProjects = Array.from(mergedMap.values());
            
            // Ensure tiers is at least an empty array for all valid projects
            validProjects.forEach(p => {
                if (!p.tiers) p.tiers = [];
            });
            
            // To ensure strict multi-tenant isolation, filter projects to match current tenantId.
            // If the current tenant is 'demo-tenant-01' or similar, we can also allow projects without a tenantId.
            const isolatedProjects = validProjects.filter(p => {
                if (!p.tenantId) {
                    return tenantId === 'demo-tenant-01' || tenantId === 'form_factors_studio';
                }
                return p.tenantId === tenantId;
            });

            return isolatedProjects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
        } catch (e: any) {
            handleError(e, 'Fetch Projects');
            return LocalStrategy.getProjects();
        }
    },

    saveProject: async (project) => {
        /*
          Two things must never reach the cloud, because both overwrite real
          data with less of it and neither is recoverable.

          A project that failed to hydrate is returned by getProjects as a shell
          with `tiers: []` so the UI does not crash on it. That shell is a
          placeholder, not a project — saving it replaces every version the
          project had with nothing.

          And a save that arrives with no tiers for a project that has them is
          the same event by another route: state cleared, a partial load, a
          component mounting before its data. The local copy is authoritative
          enough to catch it, and it is read here before it is overwritten.
        */
        if ((project as any)?._failedHydration) {
            console.error(`Refusing to save project ${project?.id}: it failed to load and is a placeholder, not data.`);
            return;
        }

        if (!project?.tiers?.length) {
            const localBefore = (await LocalStrategy.getProjects()).find(p => p.id === project?.id);
            if (localBefore?.tiers?.length) {
                console.error(
                    `Refusing to save project ${project.id}: it arrived with no versions but ${localBefore.tiers.length} are on record. ` +
                    `Nothing was written; the stored copy is untouched.`,
                );
                return;
            }
        }

        // 1. Always backup to local first (Zero Data Loss Policy)
        await LocalStrategy.saveProject(project);
        
        if (!firestore) return;
        
        try {
            // 2. Prepare Payload
            // Firestore Limit: 1 MB (1,048,576 bytes)

            
            // Create a pre-cleaned project to avoid compressing derived view data
            const cleanProject = { ...project };
            if (cleanProject.tiers) {
                cleanProject.tiers = cleanProject.tiers.map(t => {
                    const newT = { ...t };
                    delete newT.fullBoq;
                    delete newT.groupedBoq;
                    if ((newT as any).projectContext) {
                        (newT as any).projectContext = leanTierContext((newT as any).projectContext);
                    }
                    return newT;
                });
            }

            const cleanJsonString = JSON.stringify(cleanProject);
            const sizeBytes = new Blob([cleanJsonString]).size;

            // Parse the stringified JSON to automatically strip any 'undefined' values
            // which are not supported by Firestore.
            let payload: any = JSON.parse(cleanJsonString);
            payload.tenantId = getCurrentTenantId();
            
            // 3. Compression Trigger (at 800KB)
            if (sizeBytes > 800000) {
                console.log(`Project ${project.id} size (${(sizeBytes/1024).toFixed(0)}KB) exceeds threshold. Compressing...`);
                
                const compressedString = compressData(cleanProject);
                
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

                        // Remove fullBoq and groupedBoq from tiers (derived data)
                        if (leanProject.tiers) {
                            leanProject.tiers = leanProject.tiers.map(t => {
                                const newT = { ...t };
                                delete newT.fullBoq;
                                delete newT.groupedBoq;
                                return newT;
                            });
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
                        
                        // Strip Execution updates images
                        if (leanProject.activeProject?.executionData?.updates) {
                            leanProject.activeProject.executionData.updates = leanProject.activeProject.executionData.updates.map(u => ({
                                ...u,
                                images: undefined
                            }));
                        }
                        
                        // Aggressively strip any base64 images from anywhere in the project
                        const leanString = JSON.stringify(leanProject, (key, value) => {
                            if (typeof value === 'string' && value.startsWith('data:image/')) {
                                return undefined; // Strip all base64 images
                            }
                            return value;
                        });
                        const superLeanProject = JSON.parse(leanString);

                        // Compress lean version
                        // DEBUG: Find out what's huge
                        for (const key of Object.keys(leanProject)) {
                            const size = new Blob([JSON.stringify(leanProject[key])]).size;
                            if (size > 50000) {
                                console.warn(`Key ${key} is huge: ${(size/1024).toFixed(2)} KB`);
                                if (key === 'tiers') {
                                    leanProject.tiers.forEach((t, i) => console.warn(`  Tier ${i} size: ${(new Blob([JSON.stringify(t)]).size/1024).toFixed(2)} KB`));
                                } else if (key === 'activeProject' && leanProject.activeProject?.executionData) {
                                     console.warn(`  ExecutionData size: ${(new Blob([JSON.stringify(leanProject.activeProject.executionData)]).size/1024).toFixed(2)} KB`);
                                }
                            }
                        }

                        // Remove unused or huge fields
                        // If there are many tiers, only keep the active one and the first one? No that loses data.
                        
                        let leanCompressed = compressData(superLeanProject);
                        
                        /*
                          Shedding weight without shedding history.

                          These two steps used to strip the BOQs from every
                          superseded tier and then delete the tiers outright,
                          keeping only the active one. Both were silent and both
                          were permanent: a project sitting near the threshold
                          would save four tiers one minute and one the next, and
                          an approved annexure — a contractual record of what the
                          client agreed and what it cost — simply stopped
                          existing. It also broke change markers, which compare
                          the current BOQ against the version it descends from.

                          A tier record is small; its BOQ is what is large. So
                          the records are always kept, and only line detail is
                          given up, in the order that costs least:

                            1. BOQs of intermediate versions — superseded, and
                               not referenced by anything the client sees.
                            2. The original's BOQ as well, which loses the
                               baseline that markers measure against.

                          Neither step removes a tier, so the version list, its
                          lineage and its totals survive either way.
                        */
                        const originalTierId = (() => {
                          const byId = new Map<string, any>((superLeanProject.tiers || []).map((t: any) => [t.id, t]));
                          const seen = new Set<string>();
                          let cursor: any = byId.get(superLeanProject.activeTierId);
                          while (cursor?.parentTierId && !seen.has(cursor.id)) {
                            seen.add(cursor.id);
                            const next = byId.get(cursor.parentTierId);
                            if (!next) break;
                            cursor = next;
                          }
                          return cursor?.id;
                        })();

                        /*
                          The engagement record goes first: it is the largest
                          single field and it has its own document, so dropping
                          the inline copy costs nothing but a read on next open.
                        */
                        if (leanCompressed && leanCompressed.length > 900000 && superLeanProject.context?.engagement) {
                             console.warn("Project over the cloud size budget — the engagement record is stored separately and has been dropped from the inline copy.");
                             superLeanProject.context = { ...superLeanProject.context, engagement: null };
                             leanCompressed = compressData(superLeanProject);
                        }

                        if (leanCompressed && leanCompressed.length > 900000) {
                             console.warn("Project over the cloud size budget — dropping BOQ detail from intermediate versions. Version records are kept.");
                             if (superLeanProject.tiers) {
                                 superLeanProject.tiers = superLeanProject.tiers.map(t => {
                                     if (t.id === superLeanProject.activeTierId) return t;
                                     if (t.id === originalTierId) return t; // the baseline markers compare against
                                     return { ...t, boq: [], boqTrimmed: true };
                                 });
                             }
                             leanCompressed = compressData(superLeanProject);
                        }

                        if (leanCompressed && leanCompressed.length > 900000) {
                             console.warn("Project still over budget — dropping BOQ detail from the original version too. Change markers will have no baseline until it fits again.");
                             if (superLeanProject.tiers) {
                                 superLeanProject.tiers = superLeanProject.tiers.map(t =>
                                     t.id === superLeanProject.activeTierId ? t : { ...t, boq: [], boqTrimmed: true });
                             }
                             leanCompressed = compressData(superLeanProject);
                        }

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

            if (payload.compressedData && payload.compressedData.length > 1048400) {
                /*
                  Do not write. This used to blank `compressedData` and save the
                  metadata anyway, which replaced a complete cloud copy of the
                  project with an empty shell — the one outcome worse than
                  failing to save, because the previous good copy went with it.

                  Abandoning the write leaves whatever was last stored intact,
                  and the local copy still holds everything.
                */
                console.error(
                    `Project ${project.id} is too large for Firestore (${payload.compressedData.length} bytes). ` +
                    `Nothing was written; the last cloud copy is untouched and the local copy is complete.`,
                );
                return;
            }

            await setDoc(doc(firestore, "projects", project.id), payload);

            /*
              The lines, in their own documents, from the project as it was
              handed in — not from the trimmed payload, which is exactly the
              copy that may have had them removed to fit.
            */
            await writeTierBoqs(project.id, project.tiers as any[]);
            await writeEngagement(project.id, (project.context as any)?.engagement);
            
            // Also save to tenant-specific collection to ensure consistency and isolation
            try {
                await setDoc(doc(firestore, `organizations/${payload.tenantId}/projects`, project.id), payload);
            } catch (tenantSaveErr) {
                console.warn(`Could not save project to tenant collection for tenant ${payload.tenantId}`, tenantSaveErr);
            }
            
        } catch (e: any) {
            handleError(e, 'Save Project');
        }
    },

    deleteProject: async (id) => {
        await LocalStrategy.deleteProject(id);
        
        if (!firestore) return;
        try {
            await deleteDoc(doc(firestore, "projects", id));
            
            const tenantId = getCurrentTenantId();
            try {
                await deleteDoc(doc(firestore, `organizations/${tenantId}/projects`, id));
            } catch (tenantDelErr) {
                console.warn(`Could not delete project from tenant collection`, tenantDelErr);
            }
        } catch (e: any) {
            handleError(e, 'Delete Project');
        }
    },

    getBank: async () => {
        if (!firestore) return LocalStrategy.getBank();
        try {
            const docRef = doc(firestore, "master_data", getTenantDocId("item_bank"));
            const docSnap = await getDoc(docRef);
            
            let tenantItems: Item[] = [];
            if (docSnap.exists()) {
                tenantItems = (docSnap.data() as any).items as Item[];
            }
            
            // Fallback / merge with global legacy bank to recover lost imported items
            if (getTenantDocId("item_bank") !== "item_bank") {
                try {
                    const globalRef = doc(firestore, "master_data", "item_bank");
                    const globalSnap = await getDoc(globalRef);
                    if (globalSnap.exists()) {
                        const globalItems = (globalSnap.data() as any).items as Item[];
                        const seen = new Set(tenantItems.map(i => i.id));
                        for (const gItem of globalItems) {
                            if (!seen.has(gItem.id)) {
                                tenantItems.push(gItem);
                            }
                        }
                    }
                } catch (e) {}
            }

            if (tenantItems.length > 0) {
                return tenantItems;
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
            
            let tenantItems: Item[] = [];
            if (docSnap.exists()) {
                tenantItems = (docSnap.data() as any).items as Item[];
            }
            
            // Fallback / merge with global legacy bank to recover lost imported items
            if (getTenantDocId("draft_item_bank") !== "draft_item_bank") {
                try {
                    const globalRef = doc(firestore, "master_data", "draft_item_bank");
                    const globalSnap = await getDoc(globalRef);
                    if (globalSnap.exists()) {
                        const globalItems = (globalSnap.data() as any).items as Item[];
                        const seen = new Set(tenantItems.map(i => i.id));
                        for (const gItem of globalItems) {
                            if (!seen.has(gItem.id)) {
                                tenantItems.push(gItem);
                            }
                        }
                    }
                } catch (e) {}
            }

            if (tenantItems.length > 0) {
                return tenantItems;
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
                
                /*
                  Re-seeds from EMAIL_TEMPLATE_LIBRARY, which is the only place
                  client correspondence is written.

                  This used to seed from FFDS_TEMPLATES — a second, divergent
                  copy of 22 of the same templates in a different voice. Which
                  wording a client received therefore depended on whether this
                  had ever been run. A studio's own edits are still respected.
                */
                const updated = existing.map((tpl: any) => {
                    if (tpl.isCustomised) return tpl;

                    const canonical = EMAIL_TEMPLATE_LIBRARY.find(t => t.key === tpl.key);
                    if (!canonical) return tpl;

                    return {
                        ...tpl,
                        email: { ...canonical.email },
                        whatsapp: { ...canonical.whatsapp },
                        variables: canonical.variables,
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
    },
    getVendors: async () => {
        if (!firestore) return LocalStrategy.getVendors();
        try {
            const snap = await getDoc(doc(firestore, 'master_data', getTenantDocId('vendors')));
            return snap.exists() ? (snap.data().items || []) : LocalStrategy.getVendors();
        } catch { return LocalStrategy.getVendors(); }
    },
    saveVendors: async (vendors) => {
        await LocalStrategy.saveVendors(vendors);
        if (!firestore) return;
        try {
            await setDoc(doc(firestore, 'master_data', getTenantDocId('vendors')), { items: vendors }, { merge: true });
        } catch (e) { console.warn('vendor cloud sync failed', e); }
    },
    getPurchaseOrders: async (projectId) => {
        if (!firestore) return LocalStrategy.getPurchaseOrders(projectId);
        try {
            const tenantId = getCurrentTenantId();
            const col = collection(firestore, 'organizations', tenantId, 'projects', projectId, 'purchaseOrders');
            const snap = await getDocs(col);
            return snap.docs.map(d => ({ id: d.id, ...d.data() })) as PurchaseOrder[];
        } catch { return LocalStrategy.getPurchaseOrders(projectId); }
    },
    savePurchaseOrders: async (projectId, pos) => {
        await LocalStrategy.savePurchaseOrders(projectId, pos);
        if (!firestore) return;
        try {
            const tenantId = getCurrentTenantId();
            const batch = writeBatch(firestore);
            pos.forEach(po => {
                const docRef = doc(firestore, 'organizations', tenantId, 'projects', projectId, 'purchaseOrders', po.id);
                batch.set(docRef, po, { merge: true });
            });
            await batch.commit();
        } catch (e) { console.warn('PO cloud sync failed', e); }
    },
    getObservations: async () => {
        if (!firestore) return LocalStrategy.getObservations();
        try {
            const docRef = doc(firestore, "master_data", getTenantDocId("observations"));
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && Array.isArray((docSnap.data() as any).items)) {
                return (docSnap.data() as any).items as Observation[];
            }
            return LocalStrategy.getObservations();
        } catch (e: any) {
            handleError(e, 'Fetch Observations');
            return LocalStrategy.getObservations();
        }
    },
    saveObservations: async (observations) => {
        await LocalStrategy.saveObservations(observations);
        if (!firestore) return;
        try {
            const clean = JSON.parse(JSON.stringify(observations));
            await setDoc(doc(firestore, "master_data", getTenantDocId("observations")), { items: clean, updatedAt: Date.now() });
        } catch (e: any) {
            handleError(e, 'Save Observations');
        }
    },
    getSchedule: async (projectId) => {
        if (!projectId) return null;
        if (!firestore) return LocalStrategy.getSchedule(projectId);
        try {
            const tenantId = getCurrentTenantId();
            const docRef = doc(firestore, 'organizations', tenantId, 'projects', projectId, 'schedule', 'main');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data() as ProjectSchedule;
            }
            return LocalStrategy.getSchedule(projectId);
        } catch (e: any) {
            handleError(e, 'Fetch Schedule');
            return LocalStrategy.getSchedule(projectId);
        }
    },
    saveSchedule: async (projectId, schedule) => {
        await LocalStrategy.saveSchedule(projectId, schedule);
        if (!projectId || !firestore) return;
        try {
            const tenantId = getCurrentTenantId();
            const rawClean = {
                tasks: schedule.tasks || [],
                holds: schedule.holds || [],
                calendar: schedule.calendar || null,
                baselineAt: schedule.baselineAt ?? null,
                targetHandoverISO: schedule.targetHandoverISO || null,
                projectStartISO: schedule.projectStartISO || null,
                updatedAt: Date.now()
            };

            const sanitize = (val: any): any => {
                if (val === undefined) return null;
                if (val === null) return null;
                if (Array.isArray(val)) {
                    return val.map(sanitize);
                }
                if (typeof val === 'object') {
                    const cleaned: any = {};
                    for (const key of Object.keys(val)) {
                        const originalVal = val[key];
                        if (originalVal !== undefined) {
                            cleaned[key] = sanitize(originalVal);
                        }
                    }
                    return cleaned;
                }
                return val;
            };

            const clean = sanitize(rawClean);
            const docRef = doc(firestore, 'organizations', tenantId, 'projects', projectId, 'schedule', 'main');
            await setDoc(docRef, clean, { merge: true });
        } catch (e: any) {
            handleError(e, 'Save Schedule');
        }
    },
    deleteSchedule: async (projectId) => {
        if (LocalStrategy.deleteSchedule) {
            await LocalStrategy.deleteSchedule(projectId);
        }
        if (!projectId || !firestore) return;
        try {
            const tenantId = getCurrentTenantId();
            const docRef = doc(firestore, 'organizations', tenantId, 'projects', projectId, 'schedule', 'main');
            await deleteDoc(docRef);
        } catch (e: any) {
            handleError(e, 'Delete Schedule');
        }
    }
};

// --- EXPORTED INSTANCE ---
// Wrapped in the audit decorator so every DB read/write is logged for the
// Data trail / diagnostics view (services/dbAudit.ts). Transparent to callers.
export const db = auditDb(isFirebaseConfigured() ? CloudStrategy : LocalStrategy);

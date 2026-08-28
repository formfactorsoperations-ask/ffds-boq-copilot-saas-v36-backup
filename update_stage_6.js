import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyACSU8bvrSTEnETamQqt1SQmni4waMWzIo",
    authDomain: "gen-lang-client-0431334259.firebaseapp.com",
    projectId: "gen-lang-client-0431334259",
    storageBucket: "gen-lang-client-0431334259.firebasestorage.app",
    messagingSenderId: "660934723560",
    appId: "1:660934723560:web:14622747f22c0c1f37065d",
    measurementId: "G-Y87EDQW4H5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
    const orgsSnap = await getDocs(collection(db, "organizations"));
    for (const org of orgsSnap.docs) {
        const orgId = org.id;
        const projSnap = await getDocs(collection(db, `organizations/${orgId}/projects`));
        
        for (const proj of projSnap.docs) {
            const pId = proj.id;
            const pData = proj.data();
            
            const gateSnap = await getDocs(collection(db, `organizations/${orgId}/projects/${pId}/designGate`));
            let gateDoc = gateSnap.docs.find(d => d.id === 'main');
            if (gateDoc) {
                const gData = gateDoc.data();
                if (gData.gateActivated) {
                    console.log(`Checking project ${pId} (${pData.name}) - Design Gate is ACTIVE.`);
                    
                    let lc = pData.context?.lifecycle;
                    let needsUpdate = false;
                    
                    if (!lc) {
                        lc = {
                            stage: 6,
                            subState: "Execution",
                            gates: { designGateActive: { done: true, at: Date.now(), reference: "auto_fix_stage_6" } }
                        };
                        needsUpdate = true;
                    } else {
                        if (lc.stage < 6) {
                            lc.stage = 6;
                            lc.subState = "Entered Stage 6";
                            needsUpdate = true;
                        }
                        if (!lc.gates) lc.gates = {};
                        if (!lc.gates.designGateActive?.done) {
                            lc.gates.designGateActive = { done: true, at: Date.now(), reference: "auto_fix_stage_6" };
                            needsUpdate = true;
                        }
                    }
                    
                    if (needsUpdate || pData.status !== 'execution' || pData.currentStage !== 6) {
                        console.log(`-> Updating project ${pId} to stage 6 & execution status.`);
                        const batch = writeBatch(db);
                        batch.update(proj.ref, {
                            "context.lifecycle": lc,
                            "status": "execution",
                            "currentStage": 6
                        });
                        await batch.commit();
                    } else {
                        console.log(`-> Already correct.`);
                    }
                }
            }
        }
    }
    console.log("Stage 6 migration complete.");
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

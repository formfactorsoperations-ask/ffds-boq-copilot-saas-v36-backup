console.log("Starting script...");
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, setDoc, getDoc } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");

const newDBConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

// Regex search the firebaseConfig.ts because it's a TS file
const oldDBConfigStr = fs.readFileSync(path.join(__dirname, "services", "firebaseConfig.ts"), "utf8");
// Evaluate it
const oldConfigMatch = oldDBConfigStr.match(/export const firebaseConfig = ({[\s\S]*?});/);
let oldDBConfig;
if (oldConfigMatch) {
  // Use eval to safely parse the object literal
  oldDBConfig = eval('(' + oldConfigMatch[1] + ')');
} else {
  console.error("Could not parse old config from firebaseConfig.ts");
  process.exit(1);
}

console.log("Old DB:", oldDBConfig.projectId);
console.log("New DB:", newDBConfig.projectId);

const oldApp = initializeApp(oldDBConfig, "oldApp");
const newApp = initializeApp(newDBConfig, "newApp");

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

async function migrateCollection(collectionName) {
  console.log(`Migrating collection: ${collectionName}...`);
  try {
    const querySnapshot = await getDocs(collection(oldDb, collectionName));
    console.log(`Found ${querySnapshot.size} documents in ${collectionName}.`);
    
    let count = 0;
    for (const d of querySnapshot.docs) {
      await setDoc(doc(newDb, collectionName, d.id), d.data());
      count++;
      if (count % 10 === 0) console.log(`  Migrated ${count}/${querySnapshot.size} docs...`);
    }
    console.log(`Successfully migrated ${count} documents in ${collectionName}.`);
  } catch (e) {
    console.error(`Error migrating collection ${collectionName}:`, e);
  }
}

async function migrateMasterData() {
  console.log(`Migrating master_data/item_bank...`);
  try {
     const docRef = doc(oldDb, "master_data", "item_bank");
     const docSnap = await getDoc(docRef);
     if (docSnap.exists()) {
        await setDoc(doc(newDb, "master_data", "item_bank"), docSnap.data());
        console.log("Migrated item_bank.");
     } else {
        console.log("No item_bank found in old DB.");
     }
  } catch(e) { console.error(e); }

  console.log(`Migrating master_data/draft_item_bank...`);
  try {
     const docRef = doc(oldDb, "master_data", "draft_item_bank");
     const docSnap = await getDoc(docRef);
     if (docSnap.exists()) {
        await setDoc(doc(newDb, "master_data", "draft_item_bank"), docSnap.data());
        console.log("Migrated draft_item_bank.");
     } else {
        console.log("No draft_item_bank found in old DB.");
     }
  } catch(e) { console.error(e); }
  
  console.log(`Migrating master_data/templates...`);
  try {
     const docRef = doc(oldDb, "master_data", "templates");
     const docSnap = await getDoc(docRef);
     if (docSnap.exists()) {
        await setDoc(doc(newDb, "master_data", "templates"), docSnap.data());
        console.log("Migrated templates.");
     } else {
        console.log("No templates found in old DB.");
     }
  } catch(e) { console.error(e); }
}

async function runMigration() {
  await migrateCollection("projects");
  await migrateCollection("organizations");
  await migrateMasterData();
  
  // also get all documents in master_data because it might have tenant specific items
  await migrateCollection("master_data");
  
  console.log("Migration complete!");
  process.exit(0);
}

runMigration();

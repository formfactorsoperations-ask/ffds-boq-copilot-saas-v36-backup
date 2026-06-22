import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, collectionGroup } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function main() {
  try {
    const siteVisits = await getDocs(collectionGroup(db, 'siteVisits'));
    let found = 0;
    siteVisits.forEach(doc => {
      const data = doc.data();
      if (data.calendarSyncError) {
        found++;
        console.log(`[${doc.id}] Sync Error:`, data.calendarSyncError);
      }
    });
    if (found === 0) console.log("No site visits with calendarSyncError found.");
  } catch (e) {
    console.error("Error querying Firebase:", e);
  }
  process.exit(0);
}
main();

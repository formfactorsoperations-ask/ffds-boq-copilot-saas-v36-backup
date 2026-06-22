console.log("Starting test script...");
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");

const oldDBConfigStr = fs.readFileSync(path.join(__dirname, "services", "firebaseConfig.ts"), "utf8");
const oldConfigMatch = oldDBConfigStr.match(/export const firebaseConfig = ({[\s\S]*?});/);
let oldDBConfig;
if (oldConfigMatch) {
  oldDBConfig = eval('(' + oldConfigMatch[1] + ')');
} else {
  console.error("Could not parse old config");
  process.exit(1);
}

const app = initializeApp(oldDBConfig, "oldApp");
const db = getFirestore(app);

async function testFetch() {
  console.log("Fetching projects...");
  try {
    const querySnapshot = await getDocs(collection(db, "projects"));
    console.log(`Found ${querySnapshot.size} projects!`);
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}

testFetch();

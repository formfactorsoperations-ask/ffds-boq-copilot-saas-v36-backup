const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");
const pako = require("pako");

const oldDBConfigStr = fs.readFileSync(path.join(__dirname, "services", "firebaseConfig.ts"), "utf8");
const oldConfigMatch = oldDBConfigStr.match(/export const firebaseConfig = ({[\s\S]*?});/);
let oldDBConfig;
if (oldConfigMatch) {
  oldDBConfig = eval('(' + oldConfigMatch[1] + ')');
} else {
  process.exit(1);
}
const app = initializeApp(oldDBConfig, "oldApp");
const db = getFirestore(app);

async function run() {
  const querySnapshot = await getDocs(collection(db, "projects"));
  const docs = querySnapshot.docs.map(d => d.data());
  const p = docs.find(d => {
    let name = d.name || d.context?.name;
    return name && name.includes('Hiranandani One');
  });
  
  if (p && p.isCompressed) {
    const binaryString = atob(p.compressedData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes, { to: 'string' });
    const pd = JSON.parse(decompressed);
    console.log(JSON.stringify(pd.context.paymentMilestones, null, 2));
  } else if (p) {
    console.log(JSON.stringify(p.context?.paymentMilestones, null, 2));
  }
  process.exit(0);
}
run();

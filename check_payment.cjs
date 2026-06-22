const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, getDoc, updateDoc } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");
const pako = require("pako");

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

async function checkProject() {
  const querySnapshot = await getDocs(collection(db, "projects"));
  const docs = querySnapshot.docs.map(d => ({id: d.id, ...d.data()}));
  const p = docs.find(d => {
    let name = d.name || d.context?.name;
    return name === 'Hiranandani One - Fairway' || (name && name.includes('Hiranandani One'));
  });
  
  if (p) {
    if (p.isCompressed) {
        console.log("Project is compressed!");
        const binaryString = atob(p.compressedData);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const decompressed = pako.inflate(bytes, { to: 'string' });
        const pd = JSON.parse(decompressed);
        console.log("Milestones present?", !!pd.context.paymentMilestones);
        console.log("Milestones array:", JSON.stringify(pd.context.paymentMilestones, null, 2));
    } else {
        console.log("Milestones array:", p.context?.paymentMilestones);
    }
  } else {
    for(const d of docs) {
      console.log("-", d.name || d.context?.name);
    }
  }
}
checkProject();

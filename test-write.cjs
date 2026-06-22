const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc } = require("firebase/firestore");
const fs = require("fs");
const path = require("path");

const newDBConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));
const newApp = initializeApp(newDBConfig, "newApp");
const newDb = getFirestore(newApp);

async function testWrite() {
  console.log("Testing write to new DB...");
  try {
    await setDoc(doc(newDb, "test", "123"), { hello: "world" });
    console.log("Write success!");
  } catch (e) {
    console.error("Write Error:", e);
  }
  process.exit(0);
}

testWrite();

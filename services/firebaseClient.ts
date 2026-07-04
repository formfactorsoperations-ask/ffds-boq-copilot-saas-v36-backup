
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, Firestore, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';
import { firebaseConfig as fileConfig } from './firebaseConfig';
import appletConfig from '../firebase-applet-config.json';

// --- CONFIGURATION STRATEGY ---
// 1. firebase-applet-config.json (AI Studio Provisioned)
// 2. firebaseConfig.ts (Code-based / Persistent)
// 3. Environment Variables (Build time)
// 4. LocalStorage (Runtime / User pasted in Modal)
// 5. Force Local Override (Bypass Firebase)

const getStoredConfig = () => {
    try {
        const stored = localStorage.getItem('ffds_firebase_config');
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        return null;
    }
};

const isForceLocalMode = () => {
    try {
        return localStorage.getItem('ffds_force_local_mode') === 'true';
    } catch (e) {
        return false;
    }
};

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const determineConfig = () => {
    if (isForceLocalMode()) {
        console.log("Force Local Mode enabled. Bypassing Firebase configuration.");
        return null;
    }

    // 1. Check File (Highest priority for this app to force legacy FFDS DB)
    if (fileConfig && fileConfig.apiKey && fileConfig.apiKey.length > 5 && fileConfig.projectId) {
        console.log("Using configuration from services/firebaseConfig.ts");
        return fileConfig;
    }

    // 2. Check Applet Config
    if (appletConfig && appletConfig.apiKey && appletConfig.projectId) {
        console.log("Using configuration from firebase-applet-config.json");
        return appletConfig;
    }

    // 3. Check Env
    if (envConfig.apiKey && envConfig.projectId) {
        console.log("Using configuration from Environment Variables");
        return envConfig;
    }

    // 4. Check LocalStorage
    const stored = getStoredConfig();
    if (stored) {
        console.log("Using configuration from LocalStorage");
        return stored;
    }

    return null;
};

const finalConfig = determineConfig();
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

if (finalConfig) {
    try {
        // Prevent multiple initializations (HMR or Re-renders)
        let app;
        if (getApps().length > 0) {
            app = getApp();
            db = getFirestore(app);
        } else {
            app = initializeApp(finalConfig);
            db = initializeFirestore(app, {
                experimentalForceLongPolling: true,
            });
        }
        auth = getAuth(app);
        storage = getStorage(app);
        functions = getFunctions(app);
        console.log("Firebase initialized successfully");
    } catch (e) {
        console.error("Firebase initialization error:", e);
    }
}

export { db, auth, storage, functions };

export const isFirebaseConfigured = (): boolean => {
    return !!db;
};

export const saveFirebaseConfig = (config: any) => {
    localStorage.setItem('ffds_firebase_config', JSON.stringify(config));
    window.location.reload(); // Reload to initialize with new config
};

export const clearFirebaseConfig = () => {
    localStorage.removeItem('ffds_firebase_config');
    localStorage.removeItem('ffds_force_local_mode');
    window.location.reload();
};

export const setForceLocalMode = (forceLocal: boolean) => {
    if (forceLocal) {
        localStorage.setItem('ffds_force_local_mode', 'true');
    } else {
        localStorage.removeItem('ffds_force_local_mode');
    }
    window.location.reload();
};

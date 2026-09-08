
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, Firestore, setLogLevel, connectFirestoreEmulator } from 'firebase/firestore';

setLogLevel('silent');
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
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
            /*
              `experimentalForceLongPolling` is kept for the live project — it is
              what makes Firestore work behind proxies that mangle streaming —
              but it is a known contributor to the SDK's b815/ca9 watch-stream
              assertions, and against a local emulator there is nothing to work
              around. Left off there so emulator sessions exercise the normal
              transport.
            */
            const emulating = (() => {
                try {
                    if ((import.meta as any).env?.VITE_USE_FIREBASE_EMULATOR === 'true') return true;
                    return localStorage.getItem('ffds_use_emulator') === 'true';
                } catch { return false; }
            })();

            /*
              Transport: detected, not forced.

              React.StrictMode (index.tsx) double-mounts every component in dev,
              so each of the app's 25 onSnapshot listeners is subscribed, torn
              down and resubscribed immediately. Long-polling carries watch-target
              state across poll cycles, so that add/remove race has a far wider
              window than it does over WebChannel — which is how the SDK ends up
              processing a response for a target it has already dropped and
              throwing the b815/ca9 assertion. Once thrown the client is dead
              until the page reloads, which is the "Application Notice" screen.

              `experimentalForceLongPolling` was on for every session. It was
              there for the real problem it solves — proxies and networks that
              mangle streaming — but forcing it made every developer session pay
              a cost that only some networks incur. Auto-detect keeps the
              protection: the SDK opens a stream, and falls back to long-polling
              on its own when the network turns out to need it.

              `ffds_force_long_polling` in localStorage pins it back on, for a
              network where detection turns out not to be enough.
            */
            const forceLongPolling = (() => {
                try { return localStorage.getItem('ffds_force_long_polling') === 'true'; }
                catch { return false; }
            })();

            db = initializeFirestore(
                app,
                emulating
                    ? {}
                    : forceLongPolling
                        ? { experimentalForceLongPolling: true }
                        : { experimentalAutoDetectLongPolling: true },
            );
        }
        auth = getAuth(app);
        storage = getStorage(app);
        functions = getFunctions(app);

        /*
          Local emulator, opt-in only.

          Set localStorage.ffds_use_emulator = 'true' (or VITE_USE_FIREBASE_EMULATOR
          at build time) to point this session at `firebase emulators:start`
          rather than the live project, so the portal, the rules and the signed-in
          paths can be exercised end to end without touching production data.

          Never on by default: nothing changes unless the flag is set on this device.
        */
        const wantsEmulator = (() => {
            try {
                if ((import.meta as any).env?.VITE_USE_FIREBASE_EMULATOR === 'true') return true;
                return localStorage.getItem('ffds_use_emulator') === 'true';
            } catch { return false; }
        })();

        if (wantsEmulator && db) {
            connectFirestoreEmulator(db, 'localhost', 8080);
            connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
            connectFunctionsEmulator(functions, 'localhost', 5001);
            console.warn('Firebase EMULATOR mode — not talking to the live project.');
        }

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

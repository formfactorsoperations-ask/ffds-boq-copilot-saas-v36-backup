
import { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';

const COMPRESSION_PREFIX = "LZ:";
const IDB_NAME = 'FFDS_Storage_DB';
const IDB_STORE = 'key_val_store';

// --- IDB HELPER FUNCTIONS ---
const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const idbSet = async (key: string, value: string) => {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

const idbGet = async (key: string): Promise<string | undefined> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

export function useLocalStorage<T>(key: string, initialValue: T, enabled: boolean = true): [T, Dispatch<SetStateAction<T>>] {
    const pako = (window as any).pako;
    
    // --- PARSER ---
    const parse = (item: string | null): T => {
        if (!item) return initialValue;
        
        try {
            // Check for compression prefix
            if (item.startsWith(COMPRESSION_PREFIX) && pako) {
                try {
                    const base64 = item.slice(COMPRESSION_PREFIX.length);
                    const binaryString = atob(base64);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const json = pako.inflate(bytes, { to: 'string' });
                    return JSON.parse(json);
                } catch (e) {
                    console.warn(`Decompression failed for ${key}, trying raw parse.`);
                }
            }
            return JSON.parse(item);
        } catch (error) {
            console.error(`Error parsing key “${key}”:`, error);
            return initialValue;
        }
    };

    // 1. Initialize State (Synchronous try from LocalStorage)
    const [value, setValue] = useState<T>(() => {
        if (!enabled) return initialValue;
        try {
            const item = window.localStorage.getItem(key);
            // If local storage has it, use it temporarily. 
            // Effect will check IDB for newer/larger version.
            return item ? parse(item) : initialValue;
        } catch (error) {
            return initialValue;
        }
    });

    // 2. Load from IndexedDB (Async fallback for large data)
    useEffect(() => {
        if (!enabled) return;
        
        const checkIDB = async () => {
            try {
                const dbItem = await idbGet(key);
                if (dbItem) {
                    // If DB has data, it overrides LS (implies LS limit was hit previously)
                    const parsed = parse(dbItem);
                    // Only update if different to avoid loop (simple JSON string compare is ok here for init)
                    setValue(prev => {
                        if (JSON.stringify(prev) !== JSON.stringify(parsed)) {
                            return parsed;
                        }
                        return prev;
                    });
                }
            } catch (e) {
                // Ignore IDB errors on init
            }
        };
        checkIDB();
    }, [key, enabled]); // Run once on mount per key

    // 3. Save Logic (Debounced)
    const timeoutRef = useRef<any>(null);

    useEffect(() => {
        if (!enabled) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(async () => {
            try {
                let stringToStore = JSON.stringify(value);
                
                // Compress if pako exists and size > 500 bytes
                if (pako && stringToStore.length > 500) {
                    try {
                        const compressed = pako.deflate(stringToStore);
                        let binary = '';
                        const len = compressed.byteLength;
                        for (let i = 0; i < len; i++) {
                            binary += String.fromCharCode(compressed[i]);
                        }
                        const base64 = btoa(binary);
                        stringToStore = COMPRESSION_PREFIX + base64;
                    } catch (compError) {
                        console.warn('Compression failed, saving raw data');
                    }
                }

                // TRY LocalStorage FIRST
                try {
                    window.localStorage.setItem(key, stringToStore);
                    // If successful, ensure we don't have stale data in IDB taking up space?
                    // Optional: await idbDel(key); 
                    // For now, we leave IDB as is to be safe.
                } catch (error: any) {
                    if (error.name === 'QuotaExceededError' || error.code === 22) {
                        console.warn(`LocalStorage quota exceeded for ${key}. Switching to IndexedDB.`);
                        
                        // FALLBACK TO IDB
                        await idbSet(key, stringToStore);
                        
                        // Clear from LS to free up space for other small keys, 
                        // but leave a marker if we wanted to be fancy. 
                        // For now, just removing it ensures next reload checks IDB (since LS is empty).
                        window.localStorage.removeItem(key); 
                    } else {
                        throw error;
                    }
                }
            } catch (error) {
                console.error(`Failed to save ${key}`, error);
            }
        }, 1000); // 1 second debounce

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [key, value, enabled, pako]);

    return [value, setValue];
}

// ============================================================================
// dbAudit — a thin logging decorator around the DBService instance. Because
// every read/write in the app goes through the single exported `db` object,
// wrapping it here captures 100% of DB traffic with zero call-site changes.
//
// Session-scoped, in-memory ring buffer (not persisted). Exposes a subscribe
// hook so a diagnostics panel can render live.
// ============================================================================

// Durability of a write, from the integrity point of view:
//   'cloud'      — reached the database (source of truth). Safe.
//   'local-only' — no database connected; lives only in this browser. At risk.
//   'failed'     — a database write was attempted and threw. At risk.
export type SyncState = 'cloud' | 'local-only' | 'failed';

export interface IoEvent {
  id: string;
  at: number;
  op: string;                    // method name, e.g. 'saveProject'
  mode: 'Cloud' | 'Local';
  kind: 'read' | 'write';
  synced?: SyncState;            // writes only — where the data actually landed
  target?: string;               // e.g. project id, when identifiable
  bytes?: number;                // payload size (writes) / result size (reads)
  ms: number;                    // duration
  ok: boolean;
  error?: string;
}

export interface IntegritySnapshot {
  dbConnected: boolean;          // is a real database the active store?
  mode: 'Cloud' | 'Local';
  writes: number;                // this session
  durable: number;               // confirmed in the database
  atRisk: number;                // local-only + failed (not in any database)
  localOnly: number;
  failed: number;
  lastDurableAt?: number;        // last confirmed DB write
  lastWriteAt?: number;
}

const RING = 150;
let log: IoEvent[] = [];
let currentMode: 'Cloud' | 'Local' = 'Local';   // set when the db instance is wrapped
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => { try { l(); } catch { /* ignore */ } });

export const getIoLog = (): IoEvent[] => log;
export const subscribeIo = (cb: () => void): (() => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const clearIoLog = () => { log = []; emit(); };

// Integrity roll-up over this session's writes. `dbConnected` reflects whether a
// real database (Cloud) is the active store; when false, every write is local-only.
// Cached against the current `log` reference so useSyncExternalStore gets a stable
// snapshot (the log ref only changes when something is logged).
let snapCache: IntegritySnapshot | null = null;
let snapForLog: IoEvent[] | null = null;
export const getIntegritySnapshot = (): IntegritySnapshot => {
  if (snapForLog === log && snapCache) return snapCache;
  const writes = log.filter(e => e.kind === 'write');
  const durable = writes.filter(e => e.synced === 'cloud');
  const localOnly = writes.filter(e => e.synced === 'local-only');
  const failed = writes.filter(e => e.synced === 'failed');
  const mode: IoEvent['mode'] = log[0]?.mode || currentMode;
  snapCache = {
    dbConnected: mode === 'Cloud',
    mode,
    writes: writes.length,
    durable: durable.length,
    atRisk: localOnly.length + failed.length,
    localOnly: localOnly.length,
    failed: failed.length,
    lastDurableAt: durable[0]?.at,
    lastWriteAt: writes[0]?.at,
  };
  snapForLog = log;
  return snapCache;
};

const WRITE_OPS = new Set([
  'saveProject', 'deleteProject', 'upgradeLegacyProject', 'saveBank', 'saveDraftBank',
  'saveTemplates', 'saveBundles', 'saveObservations', 'seedMasterData', 'seedDefaultTemplates',
  'resetDefaultTemplates', 'seedRewrittenTemplates', 'syncLocalToCloud', 'saveOrganizationProfile',
  'saveVendors', 'savePurchaseOrders', 'saveSchedule', 'deleteSchedule',
]);

const sizeOf = (x: any): number | undefined => {
  try {
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    if (s == null) return undefined;
    return typeof Blob !== 'undefined' ? new Blob([s]).size : s.length;
  } catch { return undefined; }
};

const targetOf = (op: string, args: any[]): string | undefined => {
  const a = args[0];
  if (op === 'saveProject' || op === 'upgradeLegacyProject') return a?.id;
  if (op === 'deleteProject') return typeof a === 'string' ? a : a?.id;
  if (op === 'saveSchedule' || op === 'deleteSchedule') return typeof a === 'string' ? a : a?.id;
  return undefined;
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Wrap a DBService instance so every method call is timed and logged. */
export function auditDb<T extends Record<string, any>>(real: T): T {
  const isCloud = !!(real as any).isCloud;
  const mode: IoEvent['mode'] = isCloud ? 'Cloud' : 'Local';
  currentMode = mode;
  const out: any = {};

  for (const key of Object.keys(real)) {
    const val = (real as any)[key];
    if (typeof val !== 'function') { out[key] = val; continue; }

    out[key] = async (...args: any[]) => {
      const started = now();
      const kind: IoEvent['kind'] = WRITE_OPS.has(key) ? 'write' : (key.startsWith('get') ? 'read' : 'write');
      let ok = true, error: string | undefined, result: any;
      try {
        result = await val.apply(real, args);
        return result;
      } catch (e: any) {
        ok = false; error = e?.message || String(e);
        throw e;
      } finally {
        const ms = Math.round(now() - started);
        const bytes = kind === 'write' ? sizeOf(args[0]) : sizeOf(result);
        // Durability: a DB (Cloud) write that succeeded is durable; a failed one
        // is at-risk; with no DB connected, every write is local-only.
        const synced: SyncState | undefined = kind === 'write'
          ? (mode === 'Cloud' ? (ok ? 'cloud' : 'failed') : 'local-only')
          : undefined;
        log = [{
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          at: Date.now(), op: key, mode, kind, synced, target: targetOf(key, args), bytes, ms, ok, error,
        }, ...log].slice(0, RING);
        emit();
      }
    };
  }
  return out as T;
}

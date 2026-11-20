/**
 * A copy with every undefined field left out, at any depth.
 *
 * Firestore refuses a document holding undefined. A hole in an array becomes
 * null instead, so the elements after it keep their places. Class instances
 * (a Timestamp, a Date) are passed through as they are.
 */
export function withoutUndefined<T>(val: T): T {
  if (Array.isArray(val)) return val.map(v => (v === undefined ? null : withoutUndefined(v))) as unknown as T;
  if (val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) out[k] = withoutUndefined(v);
    }
    return out as T;
  }
  return val;
}

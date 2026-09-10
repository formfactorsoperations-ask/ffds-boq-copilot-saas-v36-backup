/*
  A short fingerprint of a settings object.

  Written the day the platform console found five projects between 60% and 95%
  of Firestore's 1 MiB document limit and the biggest single field in them was
  called `settingsHash`. It was not a hash: it was
  `JSON.stringify({ termsSettings, paymentStructure, orgData, projectContext })`
  — the entire project context, floor plan and logo images included, stored
  whole. On one project that one field was 509KB, and a copy of it was kept in
  every history entry and every tier snapshot.

  What the field is for is telling whether the settings behind an issued docket
  have changed since it was locked. Sixty-four hex characters answer that as
  well as half a megabyte does.
*/

/**
 * JSON with object keys in sorted order.
 *
 * `JSON.stringify` follows insertion order, so two objects with the same
 * contents built by different code paths would otherwise fingerprint
 * differently and report a change that never happened.
 */
function stableStringify(value: any, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';

  // A cycle cannot be serialised and must not throw here — this runs on the
  // path that issues a docket, and a fingerprint is never worth failing over.
  if (seen.has(value)) return '"[circular]"';
  seen.add(value);

  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v, seen)).join(',') + ']';
  }

  const keys = Object.keys(value).sort();
  const parts = keys
    .filter((k) => value[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k], seen));
  return '{' + parts.join(',') + '}';
}

/** FNV-1a, for the case where WebCrypto is not available. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'fnv1a-' + h.toString(16).padStart(8, '0');
}

/**
 * SHA-256 of the stable serialisation, as hex.
 *
 * Async because WebCrypto is. Callers that fingerprint settings are already
 * doing async work — reading terms and the payment structure — so this costs
 * them nothing.
 */
export async function stableHash(value: any): Promise<string> {
  const json = stableStringify(value);
  try {
    const bytes = new TextEncoder().encode(json);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Non-secure context, or a runtime without WebCrypto. A weaker fingerprint
    // still answers "did this change"; storing the whole object again would not
    // be an improvement on it.
    return fnv1a(json);
  }
}

/**
 * True when a stored value is one of the old whole-object "hashes".
 *
 * Existing documents carry the serialised object, and will keep carrying it
 * until the docket is re-issued. Anything that compares fingerprints has to be
 * able to recognise one it cannot trust.
 */
export function isLegacySettingsHash(stored: unknown): boolean {
  return typeof stored === 'string' && stored.length > 128;
}

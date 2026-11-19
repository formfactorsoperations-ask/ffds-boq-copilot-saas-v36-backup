/*
  The Material specs bank in Firestore: master_data/material_specs_<tenant>
  (lib/materialSpecs.ts). The rule lets the whole studio read it and only the
  Owner write it, and refuses any write that changes or drops a saved version;
  saving checks the same thing first, so a stale screen gets a sentence rather
  than a permission error.
*/
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { bankFromDoc, materialSpecsDocId, versionsAppendOnly, type MaterialSpecsBank } from '../lib/materialSpecs';

/** Follows the studio's bank. `null` until one has been saved. Returns the unsubscribe. */
export function watchMaterialSpecs(
  tenantId: string | undefined,
  onBank: (bank: MaterialSpecsBank | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'master_data', materialSpecsDocId(tenantId)),
    (snap) => onBank(snap.exists() ? bankFromDoc(snap.data()) : null),
    (e) => onError?.(e as Error),
  );
}

/**
 * Saves the bank. `before` is the bank as it was last read (null if it had never
 * been saved): a save that would change or drop one of its versions is refused.
 */
export async function saveMaterialSpecs(tenantId: string | undefined, bank: MaterialSpecsBank, before: MaterialSpecsBank | null): Promise<void> {
  if (!versionsAppendOnly(before, bank)) {
    throw new Error('A saved version cannot be changed or removed. Reload the bank and save a new version instead.');
  }
  await setDoc(doc(db, 'master_data', materialSpecsDocId(tenantId)), JSON.parse(JSON.stringify(bank)));
}

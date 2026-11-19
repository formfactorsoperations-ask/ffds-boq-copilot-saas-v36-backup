/*
  The Material specs bank's rule (BOQ Playground S1), proven against the rules.

  Runs in the local Firestore emulator against a throwaway "demo-" project:

    firebase emulators:exec --only firestore --project demo-security "npx vitest run materialSpecs.security.test.ts"

  Everyone in the studio reads the bank; only the Owner writes it; its versions
  only ever grow.
*/
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const STUDIO = 'studio_a';
const OTHER = 'studio_b';
const BANK = `master_data/material_specs_${STUDIO}`;

const v1 = { mat: 'hw-1', v: 1, words: 'SS Soft-Close Channels', note: 'From the package tables', by: 'Studio standard', at: 1 };
const v2 = { mat: 'hw-1', v: 2, words: 'SS soft-close hinges and telescopic channels', note: 'Telescopic channels named', by: 'Owner', at: 2 };
const bank = (versions: any[]) => ({
  families: [{ id: 'hw', name: 'Hardware System' }],
  materials: [{ id: 'hw-1', fam: 'hw', name: 'SS Soft-Close Channels', grades: ['E', 'C', 'P'] }],
  versions, recipes: {},
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-security',
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/owner'), { email: 'o@a.com', tenantId: STUDIO, role: 'Owner' });
    await setDoc(doc(db, 'users/admin'), { email: 'a@a.com', tenantId: STUDIO, role: 'Admin' });
    await setDoc(doc(db, 'users/designer'), { email: 'd@a.com', tenantId: STUDIO, role: 'Designer' });
    await setDoc(doc(db, 'users/client'), { email: 'c@x.com', tenantId: STUDIO, role: 'Client', projectIds: ['p1'] });
    await setDoc(doc(db, 'users/otherOwner'), { email: 'o@b.com', tenantId: OTHER, role: 'Owner' });
    await setDoc(doc(db, 'users/ffdsOwner'), { email: 'o@ffds.in', tenantId: 'demo-tenant-01', role: 'Owner' });
    await setDoc(doc(db, BANK), bank([v1]));
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('the Material specs bank', () => {
  it('is read by everyone in the studio, Designers included', async () => {
    await assertSucceeds(getDoc(doc(as('owner'), BANK)));
    await assertSucceeds(getDoc(doc(as('admin'), BANK)));
    await assertSucceeds(getDoc(doc(as('designer'), BANK)));
  });

  it('is not read by a client or another studio', async () => {
    await assertFails(getDoc(doc(as('client'), BANK)));
    await assertFails(getDoc(doc(as('otherOwner'), BANK)));
  });

  it('takes the Owner’s new version', async () => {
    await assertSucceeds(updateDoc(doc(as('owner'), BANK), { versions: [v1, v2], updatedBy: 'Owner' }));
  });

  it('refuses a Designer’s write, and an Admin’s', async () => {
    await assertFails(updateDoc(doc(as('designer'), BANK), { versions: [v1, v2] }));
    await assertFails(updateDoc(doc(as('admin'), BANK), { versions: [v1, v2] }));
    await assertFails(setDoc(doc(as('designer'), `master_data/material_specs_${STUDIO}`), bank([v1, v2])));
  });

  it('only ever grows its versions', async () => {
    await assertFails(updateDoc(doc(as('owner'), BANK), { versions: [] }));
    await assertFails(updateDoc(doc(as('owner'), BANK), { versions: [{ ...v1, words: 'edited' }] }));
    await assertFails(updateDoc(doc(as('owner'), BANK), { versions: [v2, v1] }));
    await assertSucceeds(updateDoc(doc(as('owner'), BANK), { materials: [{ id: 'hw-1', fam: 'hw', name: 'Hardware', grades: ['C'] }] }));
  });

  it('is not deleted by the Owner', async () => {
    await assertFails(deleteDoc(doc(as('owner'), BANK)));
  });

  it('is created by the Owner, for their own studio only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), BANK)); });
    await assertFails(setDoc(doc(as('admin'), BANK), bank([v1])));
    await assertSucceeds(setDoc(doc(as('owner'), BANK), bank([v1])));
    await assertFails(setDoc(doc(as('owner'), `master_data/material_specs_${OTHER}`), bank([v1])));
  });

  it('keeps the FFDS studio’s bank at material_specs', async () => {
    await assertSucceeds(setDoc(doc(as('ffdsOwner'), 'master_data/material_specs'), bank([v1])));
    await assertFails(setDoc(doc(as('owner'), 'master_data/material_specs'), bank([v1])));
  });
});

/*
  People's office guide on the server, in the local emulators: admins edit,
  everyone reads; birthdays kept private stay private; cards, kudos and
  emergency contacts, with every opening recorded and told.

    npm --prefix functions run build
    firebase emulators:exec --only functions,firestore,auth --project demo-pg "npx vitest run peopleGuide.functions.test.ts --environment node"
*/
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

const PROJECT = 'demo-pg';
const STUDIO = 'studio_g';
let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
type U = { fs: any; view: () => Promise<any>; run: (action: string, data: any) => Promise<any> };
const u: Record<string, U> = {};

async function makeUser(key: string, email: string, profile: any) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, key);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  const cred = await createUserWithEmailAndPassword(auth, email, 'password-123');
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `users/${cred.user.uid}`), { email, ...profile }); });
  const view = httpsCallable(fns, 'peopleGuide', { timeout: 60000 });
  const run = httpsCallable(fns, 'peopleGuideCommand', { timeout: 60000 });
  u[key] = { fs, view: async () => ((await view({})).data as any).view, run: async (action, data) => (await run({ action, data })).data };
}
const code = async (p: Promise<any>) => { try { await p; return 'ok'; } catch (e: any) { return String(e.code || e.message); } };
let n = 0;
const cid = () => `c${Date.now()}${++n}`;
/* Today in India, as the server counts it. */
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const md = today.slice(5);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `organizations/${STUDIO}`), {
      orgName: 'Studio G',
      team: [
        { id: 'tm-anish', name: 'Anish', email: 'anish@g.in', role: 'Owner' },
        { id: 'tm-tanvi', name: 'Tanvi Rao', email: 'tanvi@g.in', role: 'Designer' },
        { id: 'tm-riya', name: 'Riya', email: 'riya@g.in', role: 'Client Relations' },
        { id: 'tm-client', name: 'Mrs Kapoor', email: 'kapoor@x.in', role: 'Client' },
      ],
      peopleDesk: { policy: { requireLocation: false } },
    });
  });
  await makeUser('anish', 'anish@g.in', { tenantId: STUDIO, role: 'Owner' });
  await makeUser('tanvi', 'tanvi@g.in', { tenantId: STUDIO, role: 'Designer' });
  await makeUser('riya', 'riya@g.in', { tenantId: STUDIO, role: 'Client Relations' });
  await makeUser('client', 'kapoor@x.in', { tenantId: STUDIO, role: 'Client' });
}, 120000);
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); await env.cleanup(); });

describe('the office guide', () => {
  it('lists the studio for everyone on it, and nobody else', async () => {
    const v = await u.tanvi.view();
    expect(v.entries.map((e: any) => e.id)).toEqual(['tm-anish', 'tm-riya', 'tm-tanvi']);
    expect(v.entries[2]).toMatchObject({ email: 'tanvi@g.in', desk: '' });
    expect(v.canEdit).toBe(false);
    expect(await code(u.client.view())).toMatch(/permission-denied/);
  }, 60000);

  it('is edited by admins only', async () => {
    const row = { personId: 'tm-tanvi', desk: 'D-04', computer: 'FFDS-PC-04', mobile: '+91 98450 21804', ext: '204', birthday: md, joinedOn: '2022-06-04', showBirthday: true, remoteId: '482 113 908' };
    expect(await code(u.tanvi.run('office', row))).toMatch(/permission-denied/);
    const r = await u.anish.run('office', row);
    expect(r.view.entries.find((e: any) => e.id === 'tm-tanvi')).toMatchObject({ desk: 'D-04', remoteId: '482 113 908', updatedByName: 'Anish' });
    expect(await code(u.anish.run('office', { ...row, birthday: '1994-10-22' }))).toMatch(/invalid-argument/);
    expect(await code(u.anish.run('office', { ...row, personId: 'tm-client' }))).toMatch(/not-found/);
  }, 60000);

  it('shows the remote desktop ID to admins only, and a private birthday to nobody else', async () => {
    const riya = await u.riya.view();
    const tanvi = riya.entries.find((e: any) => e.id === 'tm-tanvi');
    expect(tanvi).toMatchObject({ desk: 'D-04', birthday: md });
    expect(tanvi).not.toHaveProperty('remoteId');
    await u.anish.run('office', { personId: 'tm-riya', birthday: '03-11', showBirthday: false });
    expect((await u.tanvi.view()).entries.find((e: any) => e.id === 'tm-riya').birthday).toBe('');
    expect((await u.riya.view()).entries.find((e: any) => e.id === 'tm-riya').birthday).toBe('03-11');
  }, 60000);

  it('is never read from the browser', async () => {
    expect(await code(getDoc(doc(u.anish.fs, `peopleDesk/${STUDIO}/office/tm-tanvi`)))).toMatch(/permission-denied/);
    expect(await code(getDocs(collection(u.anish.fs, `peopleDesk/${STUDIO}/emergency`)))).toMatch(/permission-denied/);
  }, 60000);
});

describe('essentials', () => {
  it('are kept by admins and seen by everyone', async () => {
    expect(await code(u.riya.run('essentials', { wifiName: 'Mine' }))).toMatch(/permission-denied/);
    await u.anish.run('essentials', { wifiName: 'FFDS-Studio', wifiPassword: 'secret', help: [{ label: 'Electrician', phone: '98450 11111' }] });
    expect((await u.riya.view()).essentials).toMatchObject({ wifiName: 'FFDS-Studio', wifiPassword: 'secret', help: [{ label: 'Electrician' }] });
    expect(await code(u.anish.run('essentials', { mapsUrl: 'http://x' }))).toMatch(/invalid-argument/);
  }, 60000);
});

describe('celebrations', () => {
  it("opens today's card to everyone but its person until the day, and takes one wish each", async () => {
    const card = `birthday_tm-tanvi_${today}`;
    expect((await u.riya.view()).cards.map((c: any) => c.id)).toContain(card);
    await u.riya.run('wish', { cardId: card, text: 'Happy birthday!' });
    const r = await u.riya.run('wish', { cardId: card, text: 'Happy birthday, Tanvi!' });
    expect(r.view.cards.find((c: any) => c.id === card)).toMatchObject({ signed: true, wishes: [{ by: 'tm-riya', text: 'Happy birthday, Tanvi!' }] });
    expect(await code(u.tanvi.run('wish', { cardId: card, text: 'Me!' }))).toMatch(/invalid-argument/);
    expect((await u.tanvi.view()).cards.find((c: any) => c.id === card)).toMatchObject({ mine: true, wishes: [{ name: 'Riya' }] });
    expect(await code(u.riya.run('wish', { cardId: 'birthday_tm-anish_2020-01-01', text: 'Late' }))).toMatch(/not-found/);
  }, 60000);
});

describe('kudos', () => {
  it('pins a thank-you up once, tells the person, and takes hearts', async () => {
    const id = cid();
    const one = await u.riya.run('kudos', { id, to: 'tm-tanvi', tag: 'Saved the day', text: 'Re-plotted every sheet' });
    await u.riya.run('kudos', { id, to: 'tm-tanvi', tag: 'Saved the day', text: 'Re-plotted every sheet' });
    const k = one.view.kudos.find((x: any) => x.to === 'tm-tanvi');
    expect((await u.tanvi.view()).kudos.filter((x: any) => x.to === 'tm-tanvi')).toHaveLength(1);
    await u.tanvi.run('heart', { kudosId: k.id, on: true });
    expect((await u.anish.view()).kudos.find((x: any) => x.id === k.id).hearts).toEqual(['tm-tanvi']);
    expect(await code(u.riya.run('kudos', { id: cid(), to: 'tm-riya', tag: 'Saved the day', text: 'Me' }))).toMatch(/invalid-argument/);
    await new Promise((r) => setTimeout(r, 1500));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const notes = await getDocs(collection(ctx.firestore(), 'inbox/tanvi@g.in/notes'));
      expect(notes.docs.map((d) => d.data()).filter((x: any) => x.kind === 'guide.kudos')).toHaveLength(1);
    });
  }, 60000);

  it('is taken down by its writer or an admin only', async () => {
    const k = (await u.tanvi.view()).kudos[0];
    expect(await code(u.tanvi.run('unkudos', { kudosId: k.id }))).toMatch(/permission-denied/);
    await u.anish.run('unkudos', { kudosId: k.id });
    expect((await u.tanvi.view()).kudos.find((x: any) => x.id === k.id)).toBeUndefined();
  }, 60000);
});

describe('emergency contacts', () => {
  it('are kept by each person, and admins see only who has added theirs', async () => {
    expect(await code(u.tanvi.run('emergency', { contacts: [] }))).toMatch(/invalid-argument/);
    const r = await u.tanvi.run('emergency', { contacts: [{ name: 'Ravi Rao', relation: 'Father', phone: '+91 98860 44120' }], bloodGroup: 'B+' });
    expect(r.view.emergency).toMatchObject({ contacts: [{ name: 'Ravi Rao' }], bloodGroup: 'B+', openings: [] });
    expect((await u.riya.view()).emergencyRoll).toBeUndefined();
    const roll = (await u.anish.view()).emergencyRoll;
    expect(roll.find((x: any) => x.personId === 'tm-tanvi').checkedAt).toBeTruthy();
    expect(JSON.stringify(roll)).not.toContain('Ravi');
  }, 60000);

  it('are opened by an admin with a reason, recorded once and told to the person', async () => {
    expect(await code(u.riya.run('openEmergency', { id: cid(), personId: 'tm-tanvi', reason: 'Just curious' }))).toMatch(/permission-denied/);
    expect(await code(u.anish.run('openEmergency', { id: cid(), personId: 'tm-tanvi', reason: 'hm' }))).toMatch(/invalid-argument/);
    expect(await code(u.anish.run('openEmergency', { id: cid(), personId: 'tm-riya', reason: 'Fell at site' }))).toMatch(/not-found/);
    const id = cid();
    const r = await u.anish.run('openEmergency', { id, personId: 'tm-tanvi', reason: 'Fell from a ladder at site' });
    await u.anish.run('openEmergency', { id, personId: 'tm-tanvi', reason: 'Fell from a ladder at site' });
    expect(r.opened).toMatchObject({ personId: 'tm-tanvi', contacts: [{ name: 'Ravi Rao', phone: '+91 98860 44120' }] });
    expect((await u.tanvi.view()).emergency.openings).toMatchObject([{ byName: 'Anish', reason: 'Fell from a ladder at site' }]);
    await new Promise((r) => setTimeout(r, 1500));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const notes = await getDocs(collection(ctx.firestore(), 'inbox/tanvi@g.in/notes'));
      expect(notes.docs.map((d) => d.data()).filter((x: any) => x.kind === 'guide.emergency')).toHaveLength(1);
    });
  }, 60000);

  it('keep their record of openings when the person changes them', async () => {
    await u.tanvi.run('emergency', { contacts: [{ name: 'Nisha Rao', relation: 'Sister', phone: '99000 31877' }] });
    const v = await u.tanvi.view();
    expect(v.emergency.contacts).toEqual([{ name: 'Nisha Rao', relation: 'Sister', phone: '99000 31877' }]);
    expect(v.emergency.bloodGroup).toBe('');
    expect(v.emergency.openings).toHaveLength(1);
  }, 60000);
});

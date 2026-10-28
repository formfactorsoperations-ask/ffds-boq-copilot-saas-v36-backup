import { describe, it, expect } from 'vitest';
import type { Person } from '../../lib/peopleDesk';
import {
  cleanOffice, cleanEssentials, cleanEmergency, cleanKudos, cleanReason, occasions, openCards, signCard, guideView, parseCardId, cardId,
  onYear, emergencyDue, phone, type OfficeDetails, type GuideStore,
} from '../../lib/peopleGuide';

const person = (id: string, over: Partial<Person> = {}): Person => ({ id, name: id.toUpperCase(), title: '', teamId: 'design', managerId: '', accessRole: 'employee', active: true, email: `${id}@studio.in`, ...over });
const office = (over: Partial<OfficeDetails> = {}): OfficeDetails => ({ desk: '', computer: '', mobile: '', ext: '', birthday: '', joinedOn: '', showBirthday: true, remoteId: '', ...over });
const TODAY = '2026-10-22';

describe('office details', () => {
  it('keeps what an admin types, tidied', () => {
    expect(cleanOffice({ desk: ' D-04 ', computer: 'FFDS-PC-04', mobile: '+91 98450 21804', ext: '204', birthday: '10-22', joinedOn: '2022-06-04', showBirthday: true, remoteId: '482 113 908' }, TODAY))
      .toEqual({ desk: 'D-04', computer: 'FFDS-PC-04', mobile: '+91 98450 21804', ext: '204', birthday: '10-22', joinedOn: '2022-06-04', showBirthday: true, remoteId: '482 113 908' });
  });

  it('asks for the day and month of a birthday, never the year, and a joining date that has happened', () => {
    expect(() => cleanOffice({ birthday: '1994-10-22' }, TODAY)).toThrow(/day and month/);
    expect(() => cleanOffice({ birthday: '02-30' }, TODAY)).toThrow(/day and month/);
    expect(cleanOffice({ birthday: '02-29' }, TODAY).birthday).toBe('02-29');
    expect(() => cleanOffice({ joinedOn: '2027-01-01' }, TODAY)).toThrow(/not in the future/);
  });

  it('takes phone numbers as people write them', () => {
    expect(phone('(080) 4123-4567', 'Number')).toBe('(080) 4123-4567');
    expect(() => phone('call me', 'Number')).toThrow(/phone number/);
    expect(() => phone('', 'Number', true)).toThrow(/needed/);
  });
});

describe('birthdays and anniversaries', () => {
  const people = [person('ar'), person('ki'), person('vs'), person('mn'), person('gone', { active: false })];
  const offices: Record<string, Partial<OfficeDetails>> = {
    ar: office({ birthday: '10-22' }),
    ki: office({ birthday: '10-24' }),
    vs: office({ joinedOn: '2023-10-26' }),
    mn: office({ birthday: '10-23', showBirthday: false }),
    gone: office({ birthday: '10-22' }),
  };

  it('lists what is coming, with days to go and years with the studio', () => {
    expect(occasions(people, offices, TODAY, 0, 30).map((o) => [o.personId, o.kind, o.days, o.years])).toEqual([
      ['ar', 'birthday', 0, undefined], ['ki', 'birthday', 2, undefined], ['vs', 'anniversary', 4, 3],
    ]);
  });

  it('never celebrates a birthday the person keeps to themselves, or someone who has left', () => {
    const ids = occasions(people, offices, TODAY, -10, 10).map((o) => o.personId);
    expect(ids).not.toContain('mn');
    expect(ids).not.toContain('gone');
  });

  it('opens a card the day before and keeps it open three days after', () => {
    const open = (today: string) => openCards([person('ar')], { ar: office({ birthday: '10-22' }) }, today).map((c) => c.id);
    expect(open('2026-10-20')).toEqual([]);
    expect(open('2026-10-21')).toEqual(['birthday_ar_2026-10-22']);
    expect(open('2026-10-25')).toEqual(['birthday_ar_2026-10-22']);
    expect(open('2026-10-26')).toEqual([]);
  });

  it('crosses the new year, and keeps 29 February on the 28th in other years', () => {
    expect(openCards([person('x')], { x: office({ birthday: '01-01' }) }, '2026-12-31').map((c) => c.date)).toEqual(['2027-01-01']);
    expect(onYear('02-29', 2027)).toBe('2027-02-28');
    expect(onYear('02-29', 2028)).toBe('2028-02-29');
  });

  it('counts an anniversary only once a full year has passed', () => {
    expect(occasions([person('new')], { new: office({ joinedOn: '2026-10-01' }) }, TODAY, -400, 400).filter((o) => o.kind === 'anniversary').map((o) => o.years)).toEqual([1]);
  });

  it('names a card by kind, person and day, and reads that name back', () => {
    expect(cardId('birthday', 'ar', '2026-10-22')).toBe('birthday_ar_2026-10-22');
    expect(parseCardId('anniversary_vs_2026-10-26')).toEqual({ kind: 'anniversary', personId: 'vs', date: '2026-10-26' });
    expect(parseCardId('birthday_ar_2026-02-30')).toBeNull();
    expect(parseCardId('birthday_../x_2026-10-22')).toBeNull();
  });
});

describe('signing a card', () => {
  const card = openCards([person('ar')], { ar: office({ birthday: '10-22' }) }, TODAY)[0];

  it('takes one wish a person, and lets them change it', () => {
    const one = signCard([], card, person('ki'), 'Have the best day!', 't1');
    const two = signCard(one, card, person('ki'), 'Have the best day! Cake at 4?', 't2');
    expect(two).toEqual([{ by: 'ki', name: 'KI', text: 'Have the best day! Cake at 4?', at: 't2' }]);
  });

  it('never lets someone sign their own card, or a card that is not open', () => {
    expect(() => signCard([], card, person('ar'), 'Me!', 't')).toThrow(/for you/);
    expect(() => signCard([], undefined, person('ki'), 'Late', 't')).toThrow(/not open/);
    expect(() => signCard([], card, person('ki'), '   ', 't')).toThrow(/needed/);
  });
});

describe('what each person sees', () => {
  const people = [person('ar'), person('ki'), person('boss', { accessRole: 'admin' }), person('platform-owner', { accessRole: 'admin' })];
  const store: GuideStore = {
    people,
    offices: { ar: office({ desk: 'D-04', birthday: '10-23', showBirthday: false, remoteId: '482', joinedOn: '2022-06-04' }), ki: office({ birthday: '10-23' }) },
    essentials: { wifiName: 'FFDS-Studio' },
    cards: { 'birthday_ki_2026-10-23': [{ by: 'ar', name: 'AR', text: 'Yay', at: 't' }] },
    kudos: [
      { id: 'k1', to: 'ki', from: 'ar', tag: 'Saved the day', text: 'Thanks', at: '2026-10-20T10:00:00.000Z', hearts: [] },
      { id: 'k2', to: 'ar', from: 'ki', tag: 'Client loved it', text: 'Great', at: '2026-10-21T10:00:00.000Z', hearts: ['boss'] },
    ],
    emergency: null,
    emergencyChecked: { ar: '2026-09-03T00:00:00.000Z' },
  };

  it('shows everyone the guide, in name order, without the platform owner looking in', () => {
    const v = guideView(store, person('ki'), TODAY);
    expect(v.entries.map((e) => e.id)).toEqual(['ar', 'boss', 'ki']);
    expect(v.entries[0]).toMatchObject({ desk: 'D-04', email: 'ar@studio.in', joinedOn: '2022-06-04' });
    expect(v.essentials?.wifiName).toBe('FFDS-Studio');
    expect(v.kudos.map((k) => k.id)).toEqual(['k2', 'k1']);
  });

  it('keeps remote desktop IDs and the emergency roll to admins', () => {
    const them = guideView(store, person('ki'), TODAY);
    expect(them.entries[0]).not.toHaveProperty('remoteId');
    expect(them.emergencyRoll).toBeUndefined();
    expect(them.canEdit).toBe(false);
    const boss = guideView(store, people[2], TODAY);
    expect(boss.entries[0].remoteId).toBe('482');
    expect(boss.emergencyRoll).toEqual([{ personId: 'ar', checkedAt: '2026-09-03T00:00:00.000Z' }, { personId: 'ki', checkedAt: '' }]);
    expect(boss.canEdit).toBe(true);
  });

  it('hides a private birthday from colleagues, not from the person or an admin', () => {
    expect(guideView(store, person('ki'), TODAY).entries[0].birthday).toBe('');
    expect(guideView(store, person('ar'), TODAY).entries[0].birthday).toBe('10-23');
    expect(guideView(store, people[2], TODAY).entries[0].birthday).toBe('10-23');
  });

  it("keeps a card from its person until the day itself", () => {
    expect(guideView(store, person('ar'), TODAY).cards).toMatchObject([{ personId: 'ki', signed: true, wishes: [{ text: 'Yay' }] }]);
    expect(guideView(store, person('ki'), TODAY).cards).toEqual([]);
    expect(guideView(store, person('ki'), '2026-10-23').cards).toMatchObject([{ personId: 'ki', mine: true, days: 0 }]);
  });
});

describe('the essentials, kudos and emergency contacts', () => {
  it('keeps the essentials an admin types, with a safe map link', () => {
    const e = cleanEssentials({ wifiName: 'FFDS', address: 'Line 1\nLine 2', mapsUrl: 'https://maps.app.goo.gl/x', printers: [{ name: 'FFDS-PRN-01', label: 'A4 and A3' }], help: [{ label: 'Electrician', phone: '98450 11111' }] });
    expect(e).toMatchObject({ address: 'Line 1\nLine 2', printers: [{ name: 'FFDS-PRN-01' }], help: [{ phone: '98450 11111' }] });
    expect(() => cleanEssentials({ mapsUrl: 'javascript:alert(1)' })).toThrow(/https/);
    expect(() => cleanEssentials({ help: [{ label: 'AC', phone: 'soon' }] })).toThrow(/phone number/);
  });

  it('thanks someone else, for a reason from the list', () => {
    const team = [person('ar'), person('ki'), person('gone', { active: false })];
    expect(cleanKudos({ to: 'ki', tag: 'Saved the day', text: 'Re-plotted every sheet' }, team[0], team)).toEqual({ to: 'ki', tag: 'Saved the day', text: 'Re-plotted every sheet' });
    expect(() => cleanKudos({ to: 'ar', tag: 'Saved the day', text: 'Me' }, team[0], team)).toThrow(/someone else/);
    expect(() => cleanKudos({ to: 'gone', tag: 'Saved the day', text: 'Bye' }, team[0], team)).toThrow(/who you are thanking/);
    expect(() => cleanKudos({ to: 'ki', tag: 'Best person', text: 'Hi' }, team[0], team)).toThrow(/what it was for/);
  });

  it('needs at least one person to call, and a reason to open them', () => {
    expect(cleanEmergency({ contacts: [{ name: 'Ravi Rao', relation: 'Father', phone: '+91 98860 44120' }], bloodGroup: 'B+' }))
      .toEqual({ contacts: [{ name: 'Ravi Rao', relation: 'Father', phone: '+91 98860 44120' }], bloodGroup: 'B+', allergies: '' });
    expect(() => cleanEmergency({ contacts: [] })).toThrow(/at least one/);
    expect(() => cleanEmergency({ contacts: [{ name: 'A', relation: 'B', phone: '1' }] })).toThrow(/phone number/);
    expect(() => cleanEmergency({ contacts: [{ name: 'A', relation: 'B', phone: '123' }], bloodGroup: 'Z' })).toThrow(/blood group/);
    expect(() => cleanReason('hm')).toThrow(/few words/);
    expect(cleanReason('Fell at site, going to hospital')).toBe('Fell at site, going to hospital');
  });

  it('asks for contacts to be checked twice a year', () => {
    expect(emergencyDue(null, TODAY)).toBe(true);
    expect(emergencyDue({ checkedAt: '2026-09-03T10:00:00.000Z' }, TODAY)).toBe(false);
    expect(emergencyDue({ checkedAt: '2026-03-01T10:00:00.000Z' }, TODAY)).toBe(true);
  });
});

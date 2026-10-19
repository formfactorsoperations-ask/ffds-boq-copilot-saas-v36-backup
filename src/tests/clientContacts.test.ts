import { describe, it, expect } from 'vitest';
import { clientPeople, clientEmails, personByEmail, withPortalMark, contactProblems, splitEmails } from '../../lib/clientContacts';

const ctx = {
  clientName: 'Mr Prasad Naik', clientEmail: 'Prasad@x.in', clientPhone: '+91 98200 11210',
  clientContacts: [
    { id: 'c1', name: 'Mrs Mrunal Naik', role: 'Wife', email: 'mrunal@x.in', phone: '' },
    { id: 'c2', name: 'Mr Sudhir Naik', role: 'Father', email: '', phone: '+91 90000 00000' },
    { id: 'c3', name: 'Duplicate', email: 'PRASAD@x.in' },
    { id: 'c4', name: '', email: '' },
  ],
};

describe('client contacts', () => {
  it('puts the main contact first, then the others, each email once', () => {
    expect(clientPeople(ctx).map((p) => [p.id, p.name, p.email, p.main])).toEqual([
      ['main', 'Mr Prasad Naik', 'Prasad@x.in', true],
      ['c1', 'Mrs Mrunal Naik', 'mrunal@x.in', false],
      ['c2', 'Mr Sudhir Naik', null, false],
    ]);
    expect(clientEmails(ctx)).toEqual(['Prasad@x.in', 'mrunal@x.in']);
  });
  it('reads an older email field that holds several addresses', () => {
    const old = { clientName: 'Rao', clientEmail: 'a@x.in, b@x.in; nope' };
    expect(clientPeople(old).map((p) => [p.name, p.email, p.main])).toEqual([['Rao', 'a@x.in', true], ['b@x.in', 'b@x.in', false]]);
    expect(splitEmails('a@x.in, b@x.in; nope')).toEqual(['a@x.in', 'b@x.in']);
  });
  it('knows who signed in, whatever the case of their email', () => {
    expect(personByEmail(ctx, 'MRUNAL@x.in')?.name).toBe('Mrs Mrunal Naik');
    expect(personByEmail(ctx, 'someone@else.in')).toBeNull();
  });
  it('marks portal access given and taken away, per email', () => {
    let c: any = withPortalMark(ctx, 'Mrunal@X.in', true, 'anish@s.in', 10);
    expect(clientPeople(c).find((p) => p.id === 'c1')?.portal).toBe('on');
    expect(clientPeople(c).find((p) => p.id === 'main')?.portal).toBe('off');
    expect(clientPeople(c).find((p) => p.id === 'c2')?.portal).toBe('none');
    c = withPortalMark(c, 'mrunal@x.in', false, 'anish@s.in', 20);
    expect(clientPeople(c).find((p) => p.id === 'c1')?.portal).toBe('off');
    expect(c.clientPortal['mrunal@x.in'].issuedBy).toBe('anish@s.in');
  });
  it('says what is wrong before saving', () => {
    expect(contactProblems({ clientName: 'A', clientEmail: 'a@x.in', clientContacts: [{ id: '1', name: 'B', email: 'b@' }] }))
      .toEqual(["B's email does not look right."]);
  });
});

/*
  The studio on its proposal (lib/playground/studio.ts): the details Studio
  settings holds, never the app's placeholders, as a client reads them.
*/
import { describe, it, expect, vi } from 'vitest';
import { studioDetailsOf, addressLines, hasContact, shortWeb, shortInstagram, logoForPdf } from '../../lib/playground/studio';

const org = {
  orgName: 'Form Factors Design Studio', legalName: 'Form Factors Design LLP', tagline: 'Interiors that work',
  orgLogo: 'https://firebasestorage.googleapis.com/logo.png', officeAddress: '4th floor, Kamala Mills\nLower Parel', cityState: 'Mumbai, Maharashtra',
  contactPhone: '+91 98200 12345', contactEmail: 'studio@formfactors.in', website: 'https://www.formfactors.in/', instagramUrl: 'https://instagram.com/formfactors.studio/',
  gstin: '27ABCDE1234F1Z5', credentials: ['IIID', ' 40+ homes delivered '], signatoryName: 'Anish K', signatoryTitle: 'Principal',
};

describe('the studio on its proposal', () => {
  it('reads every detail from Studio settings', () => {
    const s = studioDetailsOf(org);
    expect(s).toMatchObject({ name: 'Form Factors Design Studio', legalName: 'Form Factors Design LLP', logo: org.orgLogo, phone: '+91 98200 12345', gstin: '27ABCDE1234F1Z5', signatory: { name: 'Anish K', title: 'Principal' } });
    expect(s.credentials).toEqual(['IIID', '40+ homes delivered']);
    expect(addressLines(s)).toEqual(['4th floor, Kamala Mills', 'Lower Parel', 'Mumbai, Maharashtra']);
    expect(hasContact(s)).toBe(true);
  });

  it('never prints the app’s placeholder details as the studio’s', () => {
    const s = studioDetailsOf({ orgName: 'Interior Execution OS', contactEmail: 'hello@interiorops.com', officeAddress: '123 Business Avenue', contactPhone: '+91 9999999999' }, 'Studio from the screen');
    expect(s.name).toBe('Studio from the screen');
    expect([s.email, s.address, s.phone]).toEqual(['', '', '']);
    expect(hasContact(s)).toBe(false);
    expect(studioDetailsOf(null).name).toBe('');
  });

  it('a city already in the address is not repeated; credentials typed as one line are split', () => {
    expect(addressLines({ address: 'Linking Road, Bandra, Mumbai', cityState: 'Mumbai, Maharashtra' })).toEqual(['Linking Road, Bandra, Mumbai']);
    expect(studioDetailsOf({ credentials: 'RIBA, IIID' }).credentials).toEqual(['RIBA', 'IIID']);
  });

  it('links as a client reads them on paper', () => {
    expect(shortWeb('https://www.formfactors.in/')).toBe('formfactors.in');
    expect(shortInstagram('https://instagram.com/formfactors.studio/')).toBe('@formfactors.studio');
    expect(shortInstagram('@formfactors')).toBe('@formfactors');
  });

  it('the logo is drawn from a data URI when it can be fetched, else from its URL', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const ok = vi.fn(async () => ({ ok: true, blob: async () => blob }) as any);
    expect(await logoForPdf('https://x/logo.png', ok)).toMatch(/^data:image\/png;base64,/);
    expect(await logoForPdf('https://x/logo.png', vi.fn(async () => { throw new TypeError('CORS'); }) as any)).toBe('https://x/logo.png');
    expect(await logoForPdf('https://x/logo.png', vi.fn(async () => ({ ok: false }) as any))).toBe('https://x/logo.png');
    expect(await logoForPdf('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(await logoForPdf('')).toBe('');
  });
});

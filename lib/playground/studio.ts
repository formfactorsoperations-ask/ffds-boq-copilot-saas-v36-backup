/*
  The studio on its proposal: the logo on the cover, and its details on the
  closing page, as Studio settings → Studio identity and Money hold them
  (orgData). Nothing is typed into the proposal by hand.

  The app starts from placeholder details (contexts/OrgContext defaultOrg) and
  lays the studio's own record over them, so a field the studio never filled
  would print the placeholder. Those are left out: a proposal shows nothing
  rather than someone else's address.
*/

export interface StudioDetails {
  name: string;
  legalName: string;
  tagline: string;
  /** A URL or a data URI. */
  logo: string;
  address: string;
  cityState: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  gstin: string;
  credentials: string[];
  signatory: { name: string; title: string };
}

/** contexts/OrgContext's defaultOrg: never printed as the studio's own. */
const PLACEHOLDERS = new Set(['Interior Execution OS', 'hello@interiorops.com', '123 Business Avenue', '+91 9999999999']);

const clean = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && !PLACEHOLDERS.has(s) ? s : '';
};

export function studioDetailsOf(org: Record<string, any> | null | undefined, fallbackName = ''): StudioDetails {
  const o = org || {};
  const creds = Array.isArray(o.credentials)
    ? o.credentials
    : typeof o.credentials === 'string' ? o.credentials.split(',') : [];
  return {
    name: clean(o.orgName) || clean(fallbackName),
    legalName: clean(o.legalName),
    tagline: clean(o.tagline),
    logo: clean(o.orgLogo) || clean(o.customLogo) || clean(o.logoUrl),
    address: clean(o.officeAddress),
    cityState: clean(o.cityState),
    phone: clean(o.contactPhone),
    email: clean(o.contactEmail),
    website: clean(o.website),
    instagram: clean(o.instagramUrl),
    gstin: clean(o.gstin),
    credentials: creds.map(clean).filter(Boolean),
    signatory: { name: clean(o.signatoryName), title: clean(o.signatoryTitle) },
  };
}

/** "studio.in" for "https://www.studio.in/", "@studio" for an Instagram link: as a client reads them on paper. */
export const shortWeb = (url: string) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
export const shortInstagram = (url: string) => {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : url.startsWith('@') ? url : shortWeb(url);
};

/** The address as one block: the office address, then the city if the address does not already end with it. */
export function addressLines(s: Pick<StudioDetails, 'address' | 'cityState'>): string[] {
  const lines = s.address.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const city = s.cityState;
  if (city && !lines.join(' ').toLowerCase().includes(city.toLowerCase().split(',')[0].trim())) lines.push(city);
  return lines;
}

/** Has the studio said enough to print a closing page? Its name, and a way to reach it. */
export const hasContact = (s: StudioDetails) => !!(s.phone || s.email || s.address || s.website);

/**
 * The logo as a data URI, so the PDF can draw it: an image from another
 * origin (Firebase Storage) is left out of a canvas capture unless that origin
 * allows it. Fetched once when the preview opens; on any failure the URL is
 * used as it is, and the studio's name stands in if it still cannot be drawn.
 */
export async function logoForPdf(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  try {
    const res = await fetcher(url, { mode: 'cors' });
    if (!res.ok) return url;
    const blob = await res.blob();
    if (!/^image\//.test(blob.type)) return url;
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : url);
      r.onerror = () => resolve(url);
      r.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

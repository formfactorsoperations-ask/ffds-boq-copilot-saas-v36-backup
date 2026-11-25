/*
  A project's default picture (owner, 25 Nov 2026), for a project with no
  cover and no render (lib/coverPhoto, after the latest render):
    1. the studio's own default photo, uploaded in Studio settings >
       Data & integrations (organizations/{tenant}.defaultProjectPhoto);
    2. else an interior photo by project type, one of a few per type, picked
       steadily by the project's id so neighbouring projects differ and a
       project keeps its picture.
  A default picture is marked "No render yet" on the Projects screen, so the
  studio still sees which projects need a render or a cover.

  The type photos are from Unsplash, which the login screen already draws
  from, linked rather than copied (Unsplash's own terms ask for that). None
  shows a person.
*/

export type PhotoKind = 'apartment' | 'house' | 'commercial' | 'joinery';

const unsplash = (id: string, width: number) => `https://images.unsplash.com/photo-${id}?w=${width}&q=70&auto=format&fit=crop`;

export const KIND_PHOTOS: Record<PhotoKind, string[]> = {
  /* Living rooms. */
  apartment: [
    '1600210492486-724fe5c67fb0',
    '1600607687939-ce8a6c25118c',
    '1615529182904-14819c35db37',
    '1618221195710-dd6b41faaea6',
    '1631679706909-1844bbd07221',
    '1556228453-efd6c1ff04f6',
    '1618220179428-22790b461013',
  ],
  /* Bungalows and villas, from outside. */
  house: [
    '1600566753190-17f0baa2a6c3',
    '1600596542815-ffad4c1539a9',
    '1600585154340-be6161a56a0c',
    '1564013799919-ab600027ffc6',
  ],
  /* Offices and shops. */
  commercial: [
    '1497366216548-37526070297c',
    '1497366811353-6870744d04b2',
    '1524758631624-e2822e304c36',
    '1441986300917-64674bd600d8',
  ],
  /* Wardrobes and kitchens. */
  joinery: [
    '1600607686527-6fb886090705',
    '1595428774223-ef52624120d2',
    '1556912172-45b7abe8b7e1',
  ],
};

const HOUSE = /\b(bungalow|villa|row ?house|independent house|duplex|farm ?house|penthouse)\b/;
const COMMERCIAL = /\b(shop|retail|office|commercial|bank|branch|clinic|showroom|caf[eé]|restaurant|salon|store|studio space|co-?working)\b/;
const JOINERY = /\b(wardrobes?|kitchen|modular|joinery|cabinets?)\b/;

/** What kind of place a project is, from its configuration and its name. */
export function photoKindOf(project: { context?: any } | null | undefined): PhotoKind {
  const c = project?.context || {};
  const words = [c.config, c.bhk, c.propertyType, c.projectType, c.name].filter(Boolean).join(' ').toLowerCase();
  if (HOUSE.test(words)) return 'house';
  if (COMMERCIAL.test(words)) return 'commercial';
  if (/\b\d\s*(\+\s*\d\s*)?-?\s*bhk\b|\bapartment|\bflat\b/.test(words)) return 'apartment';
  if (JOINERY.test(words)) return 'joinery';
  return 'apartment';
}

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** The type photo a project shows by default: always the same one for the same project. */
export function typePhotoOf(project: { id?: string; context?: any } | null | undefined, width = 900): string {
  const list = KIND_PHOTOS[photoKindOf(project)];
  return unsplash(list[hash(String(project?.id || project?.context?.name || '')) % list.length], width);
}

/**
 * THE PRODUCT'S OWN NAME.
 *
 * Two brands live in this app and they must not be confused:
 *
 *  - The PRODUCT -- TheStudioDesk, made by Tervaro. It owns the login door,
 *    the browser tab, the installed-app name, and the small "powered by" line.
 *  - The STUDIO -- whichever tenant is signed in (orgData.orgName / orgLogo).
 *    It owns everything a client reads: proposals, contracts, the portal,
 *    PDFs. Those never carry the product's name in place of the studio's.
 *
 * Every product-facing string reads from here, so a future rename is one file.
 */
export const BRAND = {
  company: 'Tervaro',
  product: 'TheStudioDesk',
  descriptor: 'The operating system for design and build studios.',
  tagline: 'Bring plans to life.',
  /** The indigo the app already runs on -- the brand keeps it. */
  color: '#3D52A0',
  ink: '#0A1B33',
  /**
   * Tervaro's swirl, cut from its navy ground so it sits on light or dark.
   * The -128 file is for UI (shown at 16-40px); the 512 one for anything
   * larger. tervaro-logo.png is the full lockup as supplied, on navy.
   */
  companyMark: '/brand/tervaro-mark-128.png',
  companyMarkLarge: '/brand/tervaro-mark.png',
  companyLockup: '/brand/tervaro-logo.png',
} as const;

/** "TheStudioDesk by Tervaro" */
export const PRODUCT_BYLINE = `${BRAND.product} by ${BRAND.company}`;

/** The line a studio's client-facing surfaces may carry at the very bottom. */
export const POWERED_BY = `Powered by ${PRODUCT_BYLINE}`;

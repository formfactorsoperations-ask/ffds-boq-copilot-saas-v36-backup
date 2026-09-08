import { ProjectContext } from '../types';

/**
 * Access control for the client portal.
 *
 * The portal used to be open to anyone: LoginScreen matched a project by id,
 * email, phone or a *substring* of the project or client name, and if none of
 * those hit it fell through to `projects[0]`. Typing any string at all opened
 * someone's BOQ, financials and documents. There was no credential of any kind.
 *
 * Access is now a per-project token with an expiry, following the same shape as
 * the decision `signoffToken` the app already uses: the studio issues a link,
 * the client opens it, and the token is what grants entry. Identifiers a client
 * knows — their email, the project code — can *request* a link, but never grant
 * access on their own, because anyone can guess or overhear them.
 */

/** How long an issued portal link stays usable. */
const TOKEN_DAYS = 30;

export interface PortalAccess {
  token: string;
  /** ISO string. Compared against the clock at verification time. */
  expiresAt: string;
  issuedAt: string;
  /** Email the link was sent to, so ops can see where access went. */
  issuedTo?: string;
  /** Set when the client first opens the link — proof it was received. */
  firstUsedAt?: string;
}

function randomPart(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * Mint a portal token for a project. The project id is embedded so a token can
 * be resolved without scanning every project, exactly as the decision tokens do.
 */
export function issuePortalAccess(projectId: string, issuedTo?: string): PortalAccess {
  const expires = new Date();
  expires.setDate(expires.getDate() + TOKEN_DAYS);
  return {
    token: `${projectId}_${randomPart()}`,
    expiresAt: expires.toISOString(),
    issuedAt: new Date().toISOString(),
    issuedTo: issuedTo || undefined
  };
}

/** The project id a token claims to be for. Claim only — still verify. */
export function projectIdFromToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const at = token.lastIndexOf('_');
  return at > 0 ? token.slice(0, at) : null;
}

export type PortalDenial = 'no_token' | 'unknown_project' | 'not_issued' | 'mismatch' | 'expired';

export interface PortalVerdict {
  ok: boolean;
  reason?: PortalDenial;
  message?: string;
}

/**
 * Verify a token against the project it claims to belong to.
 *
 * Deliberately says the same thing for every failure. A message that
 * distinguishes "no such project" from "wrong token" tells someone probing the
 * portal which project codes are real.
 */
export function verifyPortalToken(token: string, context: ProjectContext | undefined): PortalVerdict {
  const deny = (reason: PortalDenial): PortalVerdict => ({
    ok: false,
    reason,
    message: 'This link is not valid any more. Ask your studio to send a new one.'
  });

  if (!token) return deny('no_token');
  if (!context) return deny('unknown_project');

  const access = (context as any).portalAccess as PortalAccess | undefined;
  if (!access || !access.token) return deny('not_issued');

  // Constant-ish comparison: no early return on first differing character.
  const a = access.token;
  if (a.length !== token.length) return deny('mismatch');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff !== 0) return deny('mismatch');

  if (access.expiresAt && new Date(access.expiresAt).getTime() < Date.now()) return deny('expired');

  return { ok: true };
}

/**
 * Whether an identifier matches a project well enough to *send* that project's
 * client a link. Exact matches only — the old substring match on project and
 * client name meant a single letter could resolve to a stranger's project.
 */
export function identifierMatchesProject(identifier: string, context: ProjectContext | undefined, projectId: string): boolean {
  if (!identifier || !context) return false;
  const q = identifier.trim().toLowerCase();
  if (!q) return false;

  if (projectId.toLowerCase() === q) return true;

  const emails = (context.clientEmail || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (emails.includes(q)) return true;

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 10) {
    const phone = (context.clientPhone || '').replace(/\D/g, '');
    if (phone && phone.length >= 10 && phone.slice(-10) === digits.slice(-10)) return true;
  }
  return false;
}

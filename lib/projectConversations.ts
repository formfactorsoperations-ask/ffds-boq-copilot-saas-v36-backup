/*
  THE PROJECT'S CONVERSATIONS (the Conversations workspace, owner, 27 Nov 2026).

  Inside a project, the Conversations view lists the project as a few
  conversations instead of six stages and a hub: each screen of the project
  lives in exactly one of them, under the studio's own screen names (owner:
  keep the studio's names). Whole project is the project's first screen and
  holds no screen of its own: it is the Hub's job, done as the project's story.

  Brief & Site is a conversation of its own (owner, 27 Nov 2026).

  A conversation shows only when the person may open at least one of its
  screens (components/ProjectWorkspace works out which, from lib/roleAccess
  and the engagement), so a Designer sees fewer conversations than the owner.
  src/tests/projectConversations.test.ts proves every route of the project
  sidebar sits in exactly one conversation.
*/

export type ConversationId = 'whole' | 'chat' | 'money' | 'boq' | 'docs' | 'design' | 'site' | 'plan' | 'brief';

export interface ConversationDef {
  id: ConversationId;
  name: string;
  /** What the conversation is about, for the list's empty preview and screen readers. */
  about: string;
  /** The screens that live in it, the one it opens first leading. */
  routes: string[];
}

export const CONVERSATIONS: ConversationDef[] = [
  { id: 'whole', name: 'Whole project', about: 'Everything on this project, in order', routes: [] },
  { id: 'chat', name: 'Client & portal', about: 'Messages with the client and their portal', routes: ['comms-tracker', 'client-portal'] },
  { id: 'money', name: 'Money', about: 'Payments, offers and pricing', routes: ['payment-calc', 'analytics', 'ops'] },
  { id: 'boq', name: 'BOQ', about: 'The BOQ, its versions and additions', routes: ['boq-editor', 'revision-studio', 'scope-additions'] },
  { id: 'docs', name: 'Documents', about: 'Everything issued to the client', routes: ['docs', 'execution-agreement', 'client', 'terms-docket', 'onboarding', 'handover-docket'] },
  { id: 'design', name: 'Design', about: 'Drawings, the Design Gate and selections', routes: ['drawing-tracker', 'design-gate', 'materials'] },
  { id: 'site', name: 'Site', about: 'Site work, snags and meetings', routes: ['site-ops', 'site-quality', 'site-meetings'] },
  { id: 'plan', name: 'Plan & timeline', about: 'Timeline, Ops Matrix, decisions and history', routes: ['timeline', 'project-journey', 'record-decision', 'project-reports', 'history'] },
  { id: 'brief', name: 'Brief & Site', about: "The client's brief and the site", routes: ['leadiq'] },
];

const BY_ROUTE: Record<string, ConversationId> = Object.fromEntries(
  CONVERSATIONS.flatMap((c) => c.routes.map((r) => [r, c.id])),
);

/** The conversation a screen lives in; null for a route that is not a project screen. */
export const conversationOf = (route: string | null | undefined): ConversationId | null =>
  (route && BY_ROUTE[route]) || null;

export const conversationDef = (id: ConversationId): ConversationDef =>
  CONVERSATIONS.find((c) => c.id === id) || CONVERSATIONS[0];

/**
 * The conversations this person sees, each with only the screens they may
 * open (`visible`: the routes the project sidebar would show them). Whole
 * project is always there; any other conversation with no screen left is not.
 */
export function conversationsFor(visible: Set<string>): ConversationDef[] {
  return CONVERSATIONS
    .map((c) => ({ ...c, routes: c.routes.filter((r) => visible.has(r)) }))
    .filter((c) => c.id === 'whole' || c.routes.length > 0);
}

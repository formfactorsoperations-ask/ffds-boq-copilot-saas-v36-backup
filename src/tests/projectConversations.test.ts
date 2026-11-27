/*
  The Conversations workspace (owner, 27 Nov 2026): the switch, the map of
  conversations and the project's story.
*/
import { describe, it, expect } from 'vitest';
import { NAV_CONFIG, ALWAYS_ON_BAND } from '../../components/navConfig';
import { CONVERSATIONS, conversationOf, conversationsFor } from '../../lib/projectConversations';
import { resolveProjectView, studioWorkspaceOf, mayChooseView, cleanView } from '../../lib/projectView';
import { buildStory, storyFor, latestOf, placeEntry, noteHomes, noteKey } from '../../lib/projectThread';
import type { ThreadEntry } from '../../lib/clientThread';

const SIDEBAR_ROUTES = [
  ...NAV_CONFIG.flatMap((s) => s.items.map((i) => i.route)),
  ...ALWAYS_ON_BAND.map((i) => i.route),
].filter((r) => r !== 'dashboard');

describe('the conversation map', () => {
  it('puts every screen of the project sidebar in exactly one conversation', () => {
    for (const r of SIDEBAR_ROUTES) {
      const homes = CONVERSATIONS.filter((c) => c.routes.includes(r)).map((c) => c.id);
      expect({ route: r, homes }).toEqual({ route: r, homes: [conversationOf(r)] });
      expect(homes.length).toBe(1);
    }
  });

  it('lists no screen the sidebar does not have', () => {
    const known = new Set(SIDEBAR_ROUTES);
    for (const c of CONVERSATIONS) for (const r of c.routes) expect(known.has(r)).toBe(true);
  });

  it('gives Brief & Site a conversation of its own (owner, 27 Nov 2026)', () => {
    expect(conversationOf('leadiq')).toBe('brief');
    expect(CONVERSATIONS.find((c) => c.id === 'design')!.routes).not.toContain('leadiq');
  });

  it('shows only the conversations a person can open something in, and always Whole project', () => {
    const designer = new Set(['drawing-tracker', 'design-gate', 'comms-tracker', 'docs', 'site-ops']);
    const ids = conversationsFor(designer).map((c) => c.id);
    expect(ids).toEqual(['whole', 'chat', 'docs', 'design', 'site']);
    expect(conversationsFor(designer).find((c) => c.id === 'docs')!.routes).toEqual(['docs']);
    expect(conversationsFor(new Set()).map((c) => c.id)).toEqual(['whole']);
  });
});

describe('which view a person sees', () => {
  it('keeps everyone on Classic until the studio allows otherwise', () => {
    expect(resolveProjectView('classic', null)).toBe('classic');
    expect(resolveProjectView('classic', 'conversations')).toBe('classic');
    expect(mayChooseView('classic')).toBe(false);
  });
  it('lets each person choose, Classic until they do', () => {
    expect(resolveProjectView('choose', null)).toBe('classic');
    expect(resolveProjectView('choose', 'conversations')).toBe('conversations');
    expect(resolveProjectView('choose', 'classic')).toBe('classic');
  });
  it('puts everyone on Conversations, with their own way back', () => {
    expect(resolveProjectView('conversations', null)).toBe('conversations');
    expect(resolveProjectView('conversations', 'classic')).toBe('classic');
    expect(mayChooseView('conversations')).toBe(true);
  });
  it('reads the studio record and a stored choice safely', () => {
    expect(studioWorkspaceOf(undefined)).toBe('classic');
    expect(studioWorkspaceOf({ projectWorkspace: 'nonsense' })).toBe('classic');
    expect(studioWorkspaceOf({ projectWorkspace: 'choose' })).toBe('choose');
    expect(cleanView('conversations')).toBe('conversations');
    expect(cleanView(42)).toBe(null);
  });
});

const entry = (over: Partial<ThreadEntry>): ThreadEntry => ({
  id: 'e', at: 1, kind: 'event', side: 'studio', text: 't', projectId: 'p', ...over,
});

describe("the project's story", () => {
  it('places each kind of entry in its conversation, with the screen it opens', () => {
    expect(placeEntry(entry({ source: 'payments' }))).toEqual({ convs: ['money'], route: 'payment-calc' });
    expect(placeEntry(entry({ kind: 'sent', source: 'sent' }))).toEqual({ convs: ['chat'], route: 'comms-tracker' });
    expect(placeEntry(entry({ kind: 'said', side: 'client' }))).toEqual({ convs: ['chat'], route: 'comms-tracker' });
    expect(placeEntry(entry({ source: 'design' }))).toEqual({ convs: ['design'], route: 'drawing-tracker' });
    expect(placeEntry(entry({ kind: 'sticker', tone: 'bad' })).convs).toEqual(['money']);
    expect(placeEntry(entry({ kind: 'sticker', tone: 'gold' })).convs).toEqual(['docs']);
  });

  it('adds the history of stage, design and scope changes, not money or documents twice', () => {
    const story = buildStory([entry({ id: 'a', at: 5, source: 'payments' })], [
      { id: 'h1', at: 3, actor: 'Asha', category: 'scope', summary: 'BOQ changed' },
      { id: 'h2', at: 4, actor: 'Asha', category: 'money', summary: 'Booking: Paid' },
      { id: 'h3', at: 6, actor: 'Asha', category: 'stage', summary: 'Stage → Execution' },
    ], 'p');
    expect(story.map((s) => s.id)).toEqual(['hist-h1', 'a', 'hist-h3']);
    expect(storyFor(story, 'boq').map((s) => s.id)).toEqual(['hist-h1']);
    expect(storyFor(story, 'whole')).toHaveLength(3);
    expect(latestOf(story, 'plan')!.text).toBe('Stage → Execution');
    expect(latestOf(story, 'site')).toBe(null);
  });

  it('keeps a note in the conversation it was written in; one written in Whole project stays there', () => {
    const homes = noteHomes([
      { id: 'n1', subject: { key: noteKey('money') } }, { id: 'n2', subject: { key: noteKey('whole') } }, { id: 'n3', subject: { key: 'tpl:update' } },
    ]);
    expect(homes).toEqual({ 'f-n1': 'money', 'f-n2': 'whole' });
    const story = buildStory([entry({ id: 'f-n1', source: 'team' }), entry({ id: 'f-n2', source: 'team' }), entry({ id: 'f-n3', source: 'team' })], [], 'p', homes);
    expect(storyFor(story, 'money').map((s) => s.id)).toEqual(['f-n1']);
    expect(storyFor(story, 'plan').map((s) => s.id)).toEqual(['f-n3']);
    expect(storyFor(story, 'whole')).toHaveLength(3);
  });
});

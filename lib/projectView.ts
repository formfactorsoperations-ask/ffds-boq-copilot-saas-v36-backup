/*
  WHICH PROJECT WORKSPACE a person sees (the Conversations view's rollout,
  owner, 27 Nov 2026).

  Two views of the same project: Classic (today's sidebar, Hub and screens)
  and Conversations (components/projectConversations: the project's
  conversations on the left, the story in the middle, the project card on the
  right, every screen in a full-screen window). Both draw the same screens
  from the same data, so a switch moves or converts nothing.

  The studio decides (Studio settings, `projectWorkspace` on its record):
    classic        everyone on Classic (the default)
    choose         each person picks their own; Classic until they do
    conversations  Conversations for everyone; anyone may still go back

  A person's own pick is kept beside their notification settings
  (services/projectViewService). Worked out here, first match wins.
*/

export type StudioWorkspaceChoice = 'classic' | 'choose' | 'conversations';
export type ProjectView = 'classic' | 'conversations';

export const studioWorkspaceOf = (org: { projectWorkspace?: string } | null | undefined): StudioWorkspaceChoice =>
  org?.projectWorkspace === 'choose' || org?.projectWorkspace === 'conversations' ? org.projectWorkspace : 'classic';

export const cleanView = (v: unknown): ProjectView | null =>
  v === 'classic' || v === 'conversations' ? v : null;

/** The view this person sees. */
export function resolveProjectView(studio: StudioWorkspaceChoice, personal: ProjectView | null): ProjectView {
  if (studio === 'classic') return 'classic';
  if (personal) return personal;
  return studio === 'conversations' ? 'conversations' : 'classic';
}

/** May this person pick their own view? Not while the studio is on Classic. */
export const mayChooseView = (studio: StudioWorkspaceChoice): boolean => studio !== 'classic';

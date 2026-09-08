import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';

/**
 * The client's write path.
 *
 * A portal client used to persist their sign-offs, queries and disputes by
 * saving the whole project document from the browser. The rule that permitted
 * it could not be narrowed — a project of any size is stored as a deflated blob
 * in `compressedData`, and security rules cannot see inside a blob, so there
 * was no way to express "the client may set documents.views" and nothing else.
 * It therefore allowed an unauthenticated caller to replace `context` entirely:
 * every rate, every internal note, every unpublished draft.
 *
 * The client now sends the action it wants taken and the server decides what it
 * means. Nothing here can widen that: the action names are a closed set on the
 * far side, and the payloads carry no paths into the document.
 */
export type ClientAction =
  | { type: 'documentView'; kind: string }
  | { type: 'signDocument'; docType: 'terms' | 'contract' | 'handover'; docket: any }
  | { type: 'signIssue'; issueId: string; docket: any }
  | {
      type: 'raiseQuery';
      issueId: string;
      documentKind: string;
      clauseRef?: string;
      clauseExcerpt?: string;
      question: string;
    }
  | { type: 'raiseDispute'; kind: string; reason: string }
  | { type: 'confirmSelection'; selectionId: string };

/**
 * Send one action. Resolves when the server has applied it.
 *
 * Deliberately not silent on failure: the portal updates its own view first so
 * the client sees an immediate response, and if the write is then refused that
 * view is a lie. Callers surface it.
 */
export async function submitClientAction(projectId: string, action: ClientAction): Promise<void> {
  if (!functions) throw new Error('Cannot reach the studio right now.');
  const call = httpsCallable(functions, 'submitClientAction');
  await call({ projectId, action });
}

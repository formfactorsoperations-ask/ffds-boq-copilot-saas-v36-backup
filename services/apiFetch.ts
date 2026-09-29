import { auth } from './firebaseClient';

/**
 * fetch() for the app's own /api routes, carrying the signed-in user's ID token.
 *
 * server.ts refuses every /api call that does not prove who is making it (see
 * lib/requireAccount.ts). The token is fetched fresh each time; the SDK caches
 * it and only goes to the network when it is close to expiry.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const user = auth?.currentUser;
  if (user) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  return fetch(path, { ...init, headers });
}

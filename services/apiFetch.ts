import { auth } from './firebaseClient';

/*
  Routes that no longer need server.ts.

  The app published on AI Studio's *.ai.studio domain is served as static
  files; server.ts does not run there, so every /api call came back as
  index.html ("Unexpected token '<' ... is not valid JSON"). These paths are
  answered here instead, wherever the app is served:

    - the AI routes run in the browser (services/apiTasks.ts); their Gemini
      calls go through the `aiGenerate` callable, so the key stays a secret;
    - email goes to the `sendStudioEmail` callable (functions/src/email.ts).

  Each answer is wrapped in a Response with the status and JSON the route
  always sent, so no caller had to change.
*/
type Local = (body: any) => Promise<{ status: number; json: any }>;

const task = (name: keyof typeof import('./apiTasks')): Local => async (body) => {
  const tasks = await import('./apiTasks');
  return (tasks[name] as any)(body);
};

const HTTPS_STATUS: Record<string, number> = {
  'functions/unauthenticated': 401,
  'functions/permission-denied': 403,
  'functions/invalid-argument': 400,
  'functions/resource-exhausted': 429,
  'functions/deadline-exceeded': 504,
};

const sendEmail: Local = async (body) => {
  const [{ httpsCallable }, { functions }] = await Promise.all([
    import('firebase/functions'),
    import('./firebaseClient'),
  ]);
  try {
    const res: any = await httpsCallable(functions, 'sendStudioEmail', { timeout: 30000 })(body);
    return { status: 200, json: res?.data };
  } catch (e: any) {
    return { status: HTTPS_STATUS[e?.code] || 500, json: { error: { message: e?.message || 'Failed to send email' } } };
  }
};

const LOCAL: Record<string, Local> = {
  '/api/structure-mom': task('structureMom'),
  '/api/parse-mom': task('parseMom'),
  '/api/predict-handover-delays': task('predictHandoverDelays'),
  '/api/analyze-floorplan': task('analyzeFloorplan'),
  '/api/analyze-room-image': task('analyzeRoomImage'),
  '/api/parse-decision-image': task('parseDecisionImage'),
  '/api/send-email': sendEmail,
};

/**
 * fetch() for the app's own /api routes, carrying the signed-in user's ID token.
 *
 * server.ts refuses every /api call that does not prove who is making it (see
 * lib/requireAccount.ts). The token is fetched fresh each time; the SDK caches
 * it and only goes to the network when it is close to expiry.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const local = LOCAL[path];
  if (local) {
    if (!auth?.currentUser) {
      return new Response(JSON.stringify({ error: { message: 'Sign in to continue.' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    let body: any = {};
    try {
      body = init.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const { status, json } = await local(body);
    return new Response(JSON.stringify(json ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  }

  const headers = new Headers(init.headers || {});
  const user = auth?.currentUser;
  if (user) {
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  return fetch(path, { ...init, headers });
}

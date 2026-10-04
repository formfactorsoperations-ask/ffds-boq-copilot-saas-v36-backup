/*
  The address clients reach the app on.

  Links that go out to clients (minutes, portal) were built from
  window.location.origin, so anything sent while working on a local copy
  pointed the client at http://localhost:3000 -- a page that does not exist on
  their machine. From a local or private address the published app is used
  instead; from the published app (or a custom domain later) its own address
  is kept. VITE_PUBLIC_APP_URL overrides the default.
*/
const PUBLISHED_APP_URL: string =
  ((import.meta as any).env?.VITE_PUBLIC_APP_URL as string) || 'https://saas-model-ffds-boq-copilot-v36-1.ai.studio';

const isPrivateHost = (host: string) =>
  host === 'localhost' ||
  host.endsWith('.localhost') ||
  /^127\./.test(host) ||
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
  host === '[::1]';

export function publicAppOrigin(): string {
  try {
    if (typeof window === 'undefined') return PUBLISHED_APP_URL.replace(/\/+$/, '');
    const { hostname, origin } = window.location;
    return (isPrivateHost(hostname) ? PUBLISHED_APP_URL : origin).replace(/\/+$/, '');
  } catch {
    return PUBLISHED_APP_URL.replace(/\/+$/, '');
  }
}

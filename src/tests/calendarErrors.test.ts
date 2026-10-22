/*
  Google Calendar refusals (lib/calendarErrors.ts): plain words, and a token
  without calendar access is told apart from the API being switched off.
*/
import { test, expect } from 'vitest';
import { calendarErrorKind, CALENDAR_MESSAGES } from '../../lib/calendarErrors';

// The 403 Google sent when the sign-in token, which never asked for calendar access, created an event.
const SCOPE_403 = JSON.stringify({ error: {
  code: 403,
  message: 'Request had insufficient authentication scopes.',
  errors: [{ message: 'Insufficient Permission', domain: 'global', reason: 'insufficientPermissions' }],
  status: 'PERMISSION_DENIED',
  details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
} });

test('a token without calendar access asks to connect again', () => {
  expect(calendarErrorKind(403, SCOPE_403)).toBe('scope');
  expect(CALENDAR_MESSAGES.scope).toMatch(/Connect Google Calendar again/);
  expect(CALENDAR_MESSAGES.scope).not.toMatch(/scopes|403/);
});

test('the Calendar API switched off is not mistaken for missing access', () => {
  const body = JSON.stringify({ error: { code: 403, errors: [{ reason: 'accessNotConfigured' }], details: [{ reason: 'SERVICE_DISABLED' }] } });
  expect(calendarErrorKind(403, body)).toBe('api-disabled');
});

test('an expired token, and anything else', () => {
  expect(calendarErrorKind(401, '{}')).toBe('expired');
  expect(calendarErrorKind(403, '{"error":{"errors":[{"reason":"forbidden"}]}}')).toBe('other');
  expect(calendarErrorKind(500, 'boom')).toBe('other');
});

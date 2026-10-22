/*
  What the app says when Google Calendar refuses a call.

  Google answers 403 both when the token was never given calendar access and
  when the Calendar API is off for the project. The raw JSON it sends back
  ("Request had insufficient authentication scopes.") tells a studio member
  nothing, and it is what ended up saved on the site visit as the sync error.
*/

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export type CalendarErrorKind = 'not-connected' | 'scope' | 'api-disabled' | 'expired' | 'other';

export const CALENDAR_MESSAGES: Record<CalendarErrorKind, string> = {
  'not-connected': "Google Calendar isn't connected. Connect it to send this to the calendar.",
  scope: "Google didn't give TheStudioDesk access to your calendar. Connect Google Calendar again and tick the box that lets it see and edit your calendar events.",
  'api-disabled': "Google Calendar isn't switched on for this app's Google Cloud project yet. Ask the studio owner to enable the Google Calendar API.",
  expired: 'Your Google Calendar connection has expired. Connect Google Calendar again.',
  other: "Google Calendar couldn't save this. Please try again.",
};

/** Which kind of refusal a Calendar API error response is. */
export function calendarErrorKind(status: number, body: string): CalendarErrorKind {
  if (status === 401) return 'expired';
  if (status !== 403) return 'other';
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication scopes/i.test(body)) return 'scope';
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(body)) return 'api-disabled';
  return 'other';
}

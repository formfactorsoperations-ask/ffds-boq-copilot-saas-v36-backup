import { collection, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { SiteVisit, ProjectContext } from '../types';
import { callGoogleCalendarAPI } from './googleCalendarService';

export const logSiteVisit = async (
  formData: Partial<SiteVisit>,
  projectId: string,
  studioId: string,
  projectContext: ProjectContext,
  studioSettings: any
) => {
  if (!projectId?.trim() || !studioId?.trim()) {
      throw new Error("Missing project ID or studio ID");
  }

  // 1. Write to Firestore exactly
  const visitRef = collection(db, `organizations/${studioId}/projects/${projectId}/siteVisits`);
  const visitData = {
    ...formData,
    loggedAt: Timestamp.now(),
    calendarSynced: false,
    calendarSyncError: null,
    googleCalendarEventId: null,
    googleMeetUrl: null,
    status: 'active' as const
  };

  const newDoc = await addDoc(visitRef, visitData);
  const siteVisitId = newDoc.id;

  // 2. Call Google Calendar MCP to create event (asynchronously or wait)
  try {
    await syncSiteVisitToCalendar(siteVisitId, visitData as SiteVisit, projectId, studioId, projectContext, studioSettings);
  } catch (error: any) {
    console.error('Failed to sync to calendar in background', error);
  }

  return siteVisitId;
};

export const fetchUpcomingVisitsFromCalendar = async (
  studioSettings: any,
  projectContextName: string
) => {
  const prefix = studioSettings?.calendarEventPrefix || "[BOQ Copilot]";
  
  const nowStr = new Date().toISOString();
  // 14 days from now
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  const endStr = endDate.toISOString();

  const params = new URLSearchParams({
    q: prefix,
    timeMin: nowStr,
    timeMax: endStr,
    orderBy: 'startTime',
    singleEvents: 'true',
    maxResults: '5'
  });

  try {
    const data = await callGoogleCalendarAPI('GET', `/calendars/primary/events?${params.toString()}`);
    const events = data.items || [];
    
    // Filter results so title contains project name
    const matches = events.filter((e: any) => 
      e.summary && e.summary.toLowerCase().includes((projectContextName || '').toLowerCase())
    );
    return matches;
  } catch (error: any) {
    console.warn("Failed to list GCal events. Might not be connected or API disabled.", error.message);
    return [];
  }
};

export const updateCalendarEventNotes = async (
  googleCalendarEventId: string,
  newNotes: string,
  studioSettings: any
) => {
  if (!googleCalendarEventId) return;
  try {
    await callGoogleCalendarAPI('PATCH', `/calendars/primary/events/${googleCalendarEventId}`, {
      description: newNotes
    });
  } catch (err) {
    console.error("Calendar update omitted or failed:", err);
  }
}

export const syncSiteVisitToCalendar = async (
  siteVisitId: string,
  visit: SiteVisit,
  projectId: string,
  studioId: string,
  projectContext: ProjectContext,
  studioSettings: any
) => {
  if (visit.calendarSynced && visit.googleCalendarEventId) return;

  let dateStr = null;
  if (visit.date) {
    if (typeof visit.date === 'string') {
      dateStr = visit.date.split('T')[0];
    } else {
      let d: Date | null = null;
      if (visit.date instanceof Date) d = visit.date;
      else if (typeof visit.date.toDate === 'function') d = visit.date.toDate();
      else if (visit.date.seconds) d = new Date(visit.date.seconds * 1000);
      
      if (d && !isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateStr = `${yyyy}-${mm}-${dd}`;
      }
    }
  }
  
  const finalStartTime = visit.startTime || "10:00"; // fallback if missing
  
  if (!dateStr) {
    console.error("Missing date for calendar sync.", { date: visit.date });
    throw new Error("Missing date for calendar sync");
  }

  // Combine into an ISO string with Asia/Kolkata (+05:30) offset
  // Format: YYYY-MM-DDTHH:mm:00+05:30
  const isoStartTime = `${dateStr}T${finalStartTime}:00+05:30`;
  const startDate = new Date(isoStartTime);
  const endDate = new Date(startDate.getTime() + (visit.durationMinutes * 60000));
  const isoEndTime = endDate.toISOString().replace('Z', '+05:30'); // Simplistic timezone shift just for structure, or we can use native methods. Wait, new Date(isoStartTime).toISOString() is UTC.
  
  // A safer construction for +05:30:
  const getOffsetTime = (d: Date) => {
    // We already parsed it assuming +05:30 when doing new Date("...T...+05:30")
    // To format it back to +05:30:
    const utcMs = d.getTime();
    const localMs = utcMs + (5.5 * 60 * 60 * 1000);
    const localDate = new Date(localMs);
    const yyyy = localDate.getUTCFullYear();
    const mm = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(localDate.getUTCDate()).padStart(2, '0');
    const hh = String(localDate.getUTCHours()).padStart(2, '0');
    const min = String(localDate.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`;
  };

  const endStr = getOffsetTime(endDate);
  
  const prefix = studioSettings?.calendarEventPrefix || "[BOQ]";
  const typeLabel = visit.type === 'site_visit' ? '👷 Site Visit' : '🤝 Client Meeting';
  const summary = `${prefix} ${typeLabel}: ${projectContext.name || 'Project'} · ${visit.phaseTitle}`;
  const colorId = visit.type === 'site_visit' ? "6" : "7";

  const description = `Project: ${projectContext.name || 'N/A'}
Client: ${projectContext.clientName || 'N/A'}
Phase: ${visit.phaseTitle}
Type: ${visit.type}
Notes: ${visit.notes || ''}

Logged via BOQ Copilot`;

  const conferenceData = visit.isVirtual ? {
    createRequest: {
      requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conferenceSolutionKey: { type: 'hangoutsMeet' }
    }
  } : undefined;

  const eventBody: any = {
    summary,
    description,
    location: visit.isVirtual ? undefined : visit.location,
    colorId,
    start: {
      dateTime: isoStartTime,
      timeZone: "Asia/Kolkata"
    },
    end: {
      dateTime: endStr,
      timeZone: "Asia/Kolkata"
    },
    attendees: visit.type === 'client_meeting' ? (visit.attendeeEmails || []).filter(e => /^[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,4}$/i.test(e)).map(email => ({ email })) : [],
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: studioSettings?.defaultReminderMinutes || 30 }]
    }
  };

  if (conferenceData) {
    eventBody.conferenceData = conferenceData;
  }

  try {
    const url = visit.isVirtual ? '/calendars/primary/events?conferenceDataVersion=1' : '/calendars/primary/events';
    const mcpData = await callGoogleCalendarAPI('POST', url, eventBody);
    
    const eventId = mcpData.id;
    const meetupUrl = mcpData.hangoutLink || undefined;

    const docRef = doc(db, `organizations/${studioId}/projects/${projectId}/siteVisits`, siteVisitId);
    await updateDoc(docRef, {
      calendarSynced: true,
      googleCalendarEventId: eventId,
      googleMeetUrl: visit.isVirtual ? meetupUrl : null,
      calendarSyncError: null
    });
  } catch (error: any) {
    const docRef = doc(db, `organizations/${studioId}/projects/${projectId}/siteVisits`, siteVisitId);
    await updateDoc(docRef, {
      calendarSynced: false,
      calendarSyncError: error.message || "Failed to sync"
    });
    throw error;
  }
};

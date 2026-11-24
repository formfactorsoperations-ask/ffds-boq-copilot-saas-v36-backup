import { useEffect, useState } from 'react';
import { watchProjectMessages } from '../../services/roomMessageService';
import type { RoomMessage } from '../../lib/roomMessages';

/**
 * A project's room messages, live: null while they load, and `error` in plain
 * words when they cannot be read. Nothing is asked for while `on` is false or
 * there is no project.
 */
export function useProjectMessages(orgId: string, projectId: string | null | undefined, on = true): { messages: RoomMessage[] | null; error: string | null } {
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMessages(null); setError(null);
    if (!on || !projectId) return;
    return watchProjectMessages(orgId, projectId, (list) => { setMessages(list); setError(null); },
      (e) => setError(e?.code === 'permission-denied'
        ? 'Messages are for the design leads and the people assigned to this project.'
        : 'The messages could not be loaded. Check the connection and try again.'));
  }, [orgId, projectId, on]);
  return { messages, error };
}

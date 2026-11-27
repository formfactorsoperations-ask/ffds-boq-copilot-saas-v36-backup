/*
  OPEN CLIENTS ON ONE CLIENT (smart workspace, PR 2).

  The Conversations workspace's client pulse ends with the next move and
  "Open in Clients". The project asks here, in this tab's session, and the
  Clients screen (components/ClientsDirectory) takes the ask once it has read
  the book and opens the client whose project it is. Nothing is stored beyond
  the tab.
*/

const KEY = 'ffds_clients_open';

/** Ask the Clients screen to open the client of this project. */
export function askClientsToOpen(projectId: string): void {
  try { sessionStorage.setItem(KEY, projectId); } catch { /* private mode: Clients opens as usual */ }
}

/** The project whose client to open, read once. */
export function takeClientsOpen(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return id || null;
  } catch { return null; }
}

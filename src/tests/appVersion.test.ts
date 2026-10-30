import { describe, it, expect, vi, afterEach } from 'vitest';
import { hardRefresh, isNewer, latestBuild } from '../../lib/appVersion';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('loading the latest StudioDesk', () => {
  it('in dev, with no build id, never says a newer one is out or asks the site', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(isNewer('abc123')).toBe(false);
    expect(await latestBuild()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a refresh drops old workers and caches, keeps phone notifications, and reloads', async () => {
    const reg = (url: string) => ({ active: { scriptURL: url }, unregister: vi.fn(async () => true) });
    const stale = reg('https://studio.example/sw.js');
    const phone = reg('https://studio.example/firebase-messaging-sw.js');
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistrations: async () => [stale, phone] } });
    const del = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['workbox-precache', 'old'], delete: del });
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as any);

    await hardRefresh();

    expect(stale.unregister).toHaveBeenCalled();
    expect(phone.unregister).not.toHaveBeenCalled();
    expect(del.mock.calls.map((c: unknown[]) => c[0])).toEqual(['workbox-precache', 'old']);
    expect(reload).toHaveBeenCalled();
  });
});

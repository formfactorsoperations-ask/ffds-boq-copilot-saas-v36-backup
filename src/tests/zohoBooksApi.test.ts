import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_ZOHO_SETTINGS,
  LinkRecord,
  NeedsAttention,
  RaiseInput,
  ZohoBooksApi,
  ZohoConnection,
  ZohoError,
  exchangeGrantCode,
  raiseDraftInvoice,
} from '../../functions/src/zohoBooksApi';

/**
 * A stand-in for Zoho Books, just faithful enough to answer the calls the
 * add-in makes and to record every one of them, so a test can say what was and
 * was not sent.
 */
function fakeZoho(opts: { invoices?: any[]; contact?: any; taxes?: any[]; failCreateOnce?: string } = {}) {
  const calls: { method: string; path: string; query: Record<string, string>; body: any }[] = [];
  const invoices = [...(opts.invoices || [])];
  let createFailures = opts.failCreateOnce ? 1 : 0;
  const contact = opts.contact ?? { contact_id: 'C1', contact_name: 'Asha Rao', gst_no: '', place_of_contact: 'MH' };
  const taxes = opts.taxes ?? [
    { tax_id: 'T-GST18', tax_name: 'GST18', tax_percentage: 18 },
    { tax_id: 'T-IGST18', tax_name: 'IGST18', tax_percentage: 18 },
  ];
  const json = (status: number, body: any) => ({ ok: status < 400, status, json: async () => body });

  const fetchImpl = async (url: string, init: any = {}) => {
    const u = new URL(url);
    if (u.hostname.startsWith('accounts.')) {
      return json(200, { access_token: 'AT-' + u.pathname, expires_in: 3600 });
    }
    const path = u.pathname.replace('/books/v3', '');
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const query = Object.fromEntries(u.searchParams.entries());
    calls.push({ method, path, query, body });

    if (path === '/contacts/C1') return json(200, { code: 0, contact });
    if (path === '/settings/taxes') return json(200, { code: 0, taxes });
    if (path === '/items' && method === 'GET') return json(200, { code: 0, items: [] });
    if (path === '/items' && method === 'POST') return json(200, { code: 0, item: { item_id: 'ITEM-' + body.name.split(' ')[1] } });
    if (path === '/invoices' && method === 'GET') {
      const pre = query.invoice_number_startswith || '';
      return json(200, { code: 0, invoices: invoices.filter((i) => i.invoice_number.startsWith(pre)), page_context: { has_more_page: false } });
    }
    if (path === '/invoices' && method === 'POST') {
      if (createFailures > 0) {
        createFailures--;
        invoices.push({ invoice_id: 'RACE', invoice_number: opts.failCreateOnce });
        return json(400, { code: 1001, message: 'Invoice number already exists.' });
      }
      const number = body.invoice_number || 'AUTO-0001';
      const inv = { invoice_id: 'I' + (invoices.length + 1), invoice_number: number, status: 'draft', total: 118000 };
      invoices.push(inv);
      return json(200, { code: 0, invoice: inv });
    }
    const one = path.match(/^\/invoices\/(.+)$/);
    if (one && method === 'GET') {
      const found = invoices.find((i) => i.invoice_id === one[1]);
      return found ? json(200, { code: 0, invoice: found }) : json(404, { code: 1002, message: 'Invoice does not exist.' });
    }
    return json(404, { code: 1, message: `unhandled ${method} ${path}` });
  };
  return { fetchImpl, calls, invoices };
}

const conn = (over: Partial<ZohoConnection> = {}): ZohoConnection => ({
  region: 'in', clientId: 'cid', clientSecret: 'secret', refreshToken: 'rt',
  organizationId: '999', organizationName: 'Form Factors',
  settings: { ...DEFAULT_ZOHO_SETTINGS, itemIds: {} },
  connectedAt: 0, connectedBy: 'a@b.c', ...over,
});

const input = (over: Partial<RaiseInput> = {}): RaiseInput => ({
  projectId: 'P1', milestoneId: 'M1', projectName: 'Harmony 704', milestoneName: 'Design Advance 1',
  milestoneType: 'design', taxableAmount: 100000, gstAmount: 18000, gstRatePct: 18,
  retainerDeducted: 0, discountApplied: 0, contactId: 'C1', ...over,
});

const memoryLinks = () => {
  const map = new Map<string, LinkRecord>();
  return { map, get: async (k: string) => map.get(k) || null, set: async (k: string, r: LinkRecord) => { map.set(k, r); } };
};

const NOW = new Date('2026-10-07T06:00:00Z');
const MH_GSTIN = '27ABCDE1234F1Z5';

let saved: ZohoConnection[];
const store = { save: async (c: ZohoConnection) => { saved.push(JSON.parse(JSON.stringify(c))); } };
beforeEach(() => { saved = []; });

describe('connecting', () => {
  it('trades a grant code for a refresh token', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) });
    const g = await exchangeGrantCode(fetchImpl, 'in', 'cid', 'sec', '1000.abc');
    expect(g.refreshToken).toBe('r');
  });

  it('explains a spent or expired grant code in plain words', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ error: 'invalid_code' }) });
    await expect(exchangeGrantCode(fetchImpl, 'in', 'cid', 'sec', 'x')).rejects.toThrow(/fresh one/);
  });

  it('refuses a response with no refresh token', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'a' }) });
    await expect(exchangeGrantCode(fetchImpl, 'in', 'cid', 'sec', 'x')).rejects.toBeInstanceOf(ZohoError);
  });
});

describe('raising a draft invoice', () => {
  it('creates one draft, with HSN, the intra-state GST group and Zoho assigning the number', async () => {
    const z = fakeZoho();
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const links = memoryLinks();
    const r = await raiseDraftInvoice(input(), { api, links, linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });

    expect(r.reused).toBe(false);
    expect(r.invoiceNumber).toBe('AUTO-0001');
    expect(r.gstLabel).toBe('CGST 9% + SGST 9%');
    expect(r.url).toBe('https://books.zoho.in/app/999#/invoices/I1');

    const post = z.calls.find((c) => c.method === 'POST' && c.path === '/invoices')!;
    expect(post.query.organization_id).toBe('999');
    expect(post.body.invoice_number).toBeUndefined();
    expect(post.body.place_of_supply).toBe('MH');
    expect(post.body.line_items[0]).toMatchObject({ rate: 100000, hsn_or_sac: '998391', tax_id: 'T-GST18' });
    expect(links.map.get('k')?.invoiceId).toBe('I1');
  });

  it('never calls anything that sends, edits or deletes', async () => {
    const z = fakeZoho();
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    await raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    for (const c of z.calls) {
      expect(['GET', 'POST']).toContain(c.method);
      expect(c.path).not.toMatch(/email|sent|void|approve|status/);
      expect(c.query.send).toBeUndefined();
      expect(JSON.stringify(c.body || {})).not.toMatch(/"send"/);
    }
  });

  it('uses IGST for a client in another state', async () => {
    const z = fakeZoho({ contact: { contact_id: 'C1', contact_name: 'Ravi', gst_no: '29ABCDE1234F1Z5', place_of_contact: 'KA' } });
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const r = await raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    expect(r.gstLabel).toBe('IGST 18%');
    const post = z.calls.find((c) => c.method === 'POST' && c.path === '/invoices')!;
    expect(post.body.line_items[0].tax_id).toBe('T-IGST18');
    expect(post.body.gst_no).toBe('29ABCDE1234F1Z5');
    expect(post.body.gst_treatment).toBe('business_gst');
  });

  it('numbers invoices FFDS/<FY>/<NNN> from the books when the studio asks for its own series', async () => {
    const z = fakeZoho({ invoices: [
      { invoice_id: 'a', invoice_number: 'FFDS/2026-27/001' },
      { invoice_id: 'b', invoice_number: 'FFDS/2026-27/002' },
      { invoice_id: 'c', invoice_number: 'FFDS/2025-26/090' },
    ] });
    const c = conn({ settings: { ...DEFAULT_ZOHO_SETTINGS, itemIds: {}, numbering: { mode: 'template', template: 'FFDS/{FY}/' } } });
    const api = new ZohoBooksApi(c, store, z.fetchImpl, () => NOW.getTime());
    const r = await raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    expect(r.invoiceNumber).toBe('FFDS/2026-27/003');
    const post = z.calls.find((x) => x.method === 'POST' && x.path === '/invoices')!;
    expect(post.query.ignore_auto_number_generation).toBe('true');
  });

  it('takes the next number when two people raced for the same one', async () => {
    const z = fakeZoho({ failCreateOnce: 'FFDS/2026-27/001' });
    const c = conn({ settings: { ...DEFAULT_ZOHO_SETTINGS, itemIds: {}, numbering: { mode: 'template', template: 'FFDS/{FY}/' } } });
    const api = new ZohoBooksApi(c, store, z.fetchImpl, () => NOW.getTime());
    const r = await raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    expect(r.invoiceNumber).toBe('FFDS/2026-27/002');
  });

  it('hands back the existing draft instead of making a second one', async () => {
    const z = fakeZoho();
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const links = memoryLinks();
    const deps = { api, links, linkKey: 'k', studioGstin: MH_GSTIN, now: NOW };
    const first = await raiseDraftInvoice(input(), deps);
    const again = await raiseDraftInvoice(input(), deps);
    expect(again.reused).toBe(true);
    expect(again.invoiceId).toBe(first.invoiceId);
    expect(z.calls.filter((c) => c.method === 'POST' && c.path === '/invoices')).toHaveLength(1);
  });

  it('makes a new draft when the old one was deleted in Zoho', async () => {
    const z = fakeZoho();
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const links = memoryLinks();
    links.map.set('k', { invoiceId: 'GONE', invoiceNumber: 'X', createdAt: 0 });
    const r = await raiseDraftInvoice(input(), { api, links, linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    expect(r.reused).toBe(false);
  });

  it('refuses to hand back an invoice that has already gone out', async () => {
    const z = fakeZoho({ invoices: [{ invoice_id: 'I9', invoice_number: 'X-9', status: 'sent', total: 1 }] });
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const links = memoryLinks();
    links.map.set('k', { invoiceId: 'I9', invoiceNumber: 'X-9', createdAt: 0 });
    await expect(raiseDraftInvoice(input(), { api, links, linkKey: 'k', studioGstin: MH_GSTIN, now: NOW }))
      .rejects.toMatchObject({ reason: 'invoice_sent' });
  });

  it('asks for the place of supply rather than guessing it', async () => {
    const z = fakeZoho({ contact: { contact_id: 'C1', contact_name: 'Nobody', gst_no: '', place_of_contact: '' } });
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    await expect(raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW }))
      .rejects.toMatchObject({ reason: 'place_of_supply' });
    expect(z.calls.some((c) => c.method === 'POST' && c.path === '/invoices')).toBe(false);
  });

  it('uses a place of supply chosen in the app when Zoho has none', async () => {
    const z = fakeZoho({ contact: { contact_id: 'C1', contact_name: 'Nobody', gst_no: '', place_of_contact: '' } });
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const r = await raiseDraftInvoice(input({ placeOfSupply: 'Karnataka' }), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    expect(r.gstLabel).toBe('IGST 18%');
    expect(r.placeOfSupply).toBe('KA');
  });

  it('needs the studio GSTIN to know which state it supplies from', async () => {
    const z = fakeZoho();
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    await expect(raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: '', now: NOW }))
      .rejects.toBeInstanceOf(NeedsAttention);
  });

  it('says so when Zoho has no matching tax', async () => {
    const z = fakeZoho({ taxes: [{ tax_id: 'T1', tax_name: 'GST12', tax_percentage: 12 }] });
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    await expect(raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW }))
      .rejects.toMatchObject({ reason: 'tax_missing' });
  });

  it('sends the retainer as an after-GST adjustment and reports both totals', async () => {
    const z = fakeZoho();
    const api = new ZohoBooksApi(conn(), store, z.fetchImpl, () => NOW.getTime());
    const r = await raiseDraftInvoice(input({ retainerDeducted: 4999 }), { api, links: memoryLinks(), linkKey: 'k', studioGstin: MH_GSTIN, now: NOW });
    const post = z.calls.find((c) => c.method === 'POST' && c.path === '/invoices')!;
    expect(post.body.adjustment).toBe(-4999);
    expect(r.expectedTotal).toBe(113001);
  });

  it('looks each service item up once, then remembers it', async () => {
    const z = fakeZoho();
    const c = conn();
    const api = new ZohoBooksApi(c, store, z.fetchImpl, () => NOW.getTime());
    await raiseDraftInvoice(input(), { api, links: memoryLinks(), linkKey: 'k1', studioGstin: MH_GSTIN, now: NOW });
    await raiseDraftInvoice(input({ milestoneId: 'M2' }), { api, links: memoryLinks(), linkKey: 'k2', studioGstin: MH_GSTIN, now: NOW });
    expect(z.calls.filter((x) => x.path === '/items' && x.method === 'POST')).toHaveLength(1);
    expect(c.settings.itemIds.design).toBeTruthy();
  });
});

describe('tokens', () => {
  it('reuses a live access token and refreshes an expiring one', async () => {
    let refreshes = 0;
    const z = fakeZoho();
    const counting = async (url: string, init?: any) => {
      if (new URL(url).hostname.startsWith('accounts.')) refreshes++;
      return z.fetchImpl(url, init);
    };
    const t0 = NOW.getTime();
    const c = conn({ accessToken: 'live', accessTokenExpiresAt: t0 + 30 * 60 * 1000 });
    const api = new ZohoBooksApi(c, store, counting, () => t0);
    await api.getContact('C1');
    expect(refreshes).toBe(0);

    const stale = conn({ accessToken: 'old', accessTokenExpiresAt: t0 + 30 * 1000 });
    const api2 = new ZohoBooksApi(stale, store, counting, () => t0);
    await api2.getContact('C1');
    expect(refreshes).toBe(1);
    expect(saved.at(-1)?.accessToken).toMatch(/^AT-/);
  });
});

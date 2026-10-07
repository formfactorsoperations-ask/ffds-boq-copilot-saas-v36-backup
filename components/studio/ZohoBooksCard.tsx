import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Plug, Copy } from '@/lib/lucide-shim';
import { useZohoBooks } from '../../hooks/useZohoBooks';
import { ZohoRegionCode, ZohoSettingsView, ZohoStatus, zohoCall } from '../../services/zohoBooksService';
import { ZOHO_REGIONS, ZOHO_SCOPES, nextInvoiceNumber, validateNumberTemplate } from '../../lib/zohoBooks';

/**
 * Studio Settings → Zoho Books (optional add-in).
 *
 * A studio that does not use Zoho Books never needs to open this card, and the
 * app behaves as it always has. For a studio that does, it walks through
 * creating a "Self Client" in Zoho's API console, which is how a studio gets
 * API access to its own books without anyone building a Zoho app for it. The
 * grant code is exchanged on the server; the client secret and token are never
 * shown again and never come back to the browser.
 */

const input = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-[#3D52A0] outline-none';
const label = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

const consoleHost = (region: ZohoRegionCode) => `api-console.${ZOHO_REGIONS[region].accounts.replace('accounts.', '')}`;

const ZohoBooksCard: React.FC = () => {
  const { status, unknown, loading, refresh, setStatus, tenantId } = useZohoBooks();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [region, setRegion] = useState<ZohoRegionCode>('in');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [code, setCode] = useState('');
  const [orgChoice, setOrgChoice] = useState('');
  const [settings, setSettings] = useState<ZohoSettingsView | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  useEffect(() => { if (status?.settings) setSettings(status.settings); }, [status?.settings]);

  const run = async (fn: () => Promise<ZohoStatus | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      if (next) setStatus(next);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const next = await zohoCall<ZohoStatus>('connect', { region, clientId: clientId.trim(), clientSecret: clientSecret.trim(), code: code.trim() }, tenantId);
    setClientSecret('');
    setCode('');
    return next;
  });

  const chooseOrg = () => run(() => zohoCall<ZohoStatus>('selectOrganization', { organizationId: orgChoice }, tenantId));

  const save = () => run(async () => {
    const next = await zohoCall<ZohoStatus>('saveSettings', { settings }, tenantId);
    setSavedAt(true);
    setTimeout(() => setSavedAt(false), 2500);
    return next;
  });

  const disconnect = () => {
    if (!window.confirm('Disconnect Zoho Books? Invoices already drafted in Zoho stay there. New invoices will be raised inside this app again.')) return;
    void run(() => zohoCall<ZohoStatus>('disconnect', {}, tenantId));
  };

  const copyScopes = async () => {
    try {
      await navigator.clipboard.writeText(ZOHO_SCOPES);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the scopes are on screen to copy by hand */ }
  };

  const connected = !!status?.connected;
  const canManage = !!status?.canManage;
  const templateProblem = settings?.numbering.mode === 'template' ? validateNumberTemplate(settings.numbering.template) : null;
  const preview = settings?.numbering.mode === 'template' && !templateProblem
    ? nextInvoiceNumber(settings.numbering.template, new Date(), []) : null;

  const pill = connected
    ? <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">Connected</span>
    : <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">Optional · Off</span>;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700 shrink-0">
            <Plug className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Zoho Books</h3>
              {pill}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {connected
                ? `Raising invoices as drafts in ${status?.organizationName || 'your Zoho Books'}`
                : 'Draft milestone invoices straight into your Zoho Books. Skip this if you do not use it.'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-6 md:p-8 space-y-6">
          {loading && !status && <p className="text-sm text-slate-500">Checking the connection…</p>}
          {unknown && !status && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Could not reach the server to check Zoho Books. <button className="underline font-semibold" onClick={() => void refresh()}>Try again</button></span>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <span>
              Invoices are created as <b>drafts</b> in Zoho and are <b>never sent</b> from here. You review and send them from Zoho Books.
              The connection can add drafts and customers; it has no permission to edit or delete anything in your books.
            </span>
          </div>

          {status?.unavailable && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                The Zoho Books service is not deployed for this project yet, so it cannot be connected. Deploy it once
                with <code className="font-mono text-xs bg-white/70 px-1 rounded">firebase deploy --only functions:zohoBooks,firestore:rules</code>,
                then reopen this page.
              </span>
            </div>
          )}

          {status && !status.unavailable && !canManage && (
            <p className="text-sm text-slate-600">Only an Owner or Admin can connect or change Zoho Books.</p>
          )}

          {/* ── Not connected: setup ───────────────────────────────────────── */}
          {status && !connected && !status.needsOrganization && canManage && (
            <div className="space-y-5">
              <ol className="space-y-3 text-sm text-slate-700 list-decimal pl-5 marker:font-bold marker:text-slate-400">
                <li>
                  Pick your Zoho data centre (the domain you sign in to Zoho on), then open its{' '}
                  <a className="text-[#3D52A0] font-semibold underline inline-flex items-center gap-1" href={`https://${consoleHost(region)}`} target="_blank" rel="noreferrer">
                    API console <ExternalLink className="w-3 h-3" />
                  </a>.
                </li>
                <li>Choose <b>Self Client</b> (add one if asked), then <b>Create Now</b>.</li>
                <li>On the <b>Client Secret</b> tab, copy the <b>Client ID</b> and <b>Client Secret</b> into the boxes below.</li>
                <li>
                  On the <b>Generate Code</b> tab, paste this as the <b>Scope</b>, set the time duration to <b>10 minutes</b>, add any description, and click <b>Create</b>.
                  <div className="mt-2 flex items-start gap-2">
                    <code className="flex-1 text-[11px] bg-slate-100 border border-slate-200 rounded-lg p-2 break-all select-all">{ZOHO_SCOPES}</code>
                    <button onClick={copyScopes} className="px-2.5 py-2 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1">
                      <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </li>
                <li>Copy the <b>code</b> Zoho shows and paste it below straight away. It works once and expires in minutes.</li>
              </ol>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={label}>Data centre</label>
                  <select className={input} value={region} onChange={(e) => setRegion(e.target.value as ZohoRegionCode)}>
                    {(Object.keys(ZOHO_REGIONS) as ZohoRegionCode[]).map((r) => <option key={r} value={r}>{ZOHO_REGIONS[r].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Client ID</label>
                  <input className={input} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
                <div>
                  <label className={label}>Client secret</label>
                  <input className={input} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label className={label}>Grant code</label>
                  <input className={input} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
              </div>
              <button
                disabled={busy || clientId.trim().length < 10 || clientSecret.trim().length < 10 || code.trim().length < 10}
                onClick={connect}
                className="px-5 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-40 transition-colors"
              >
                {busy ? 'Connecting…' : 'Connect Zoho Books'}
              </button>
            </div>
          )}

          {/* ── Several organisations: choose one ──────────────────────────── */}
          {status?.needsOrganization && canManage && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">That Zoho login has more than one Books organisation. Which one holds your invoices?</p>
              {status.needsOrganization.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="zoho-org" value={o.id} checked={orgChoice === o.id} onChange={() => setOrgChoice(o.id)} />
                  {o.name}
                </label>
              ))}
              <button disabled={busy || !orgChoice} onClick={chooseOrg} className="px-5 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold disabled:opacity-40">
                Use this organisation
              </button>
            </div>
          )}

          {/* ── Connected: settings ────────────────────────────────────────── */}
          {connected && settings && canManage && (
            <div className="space-y-5">
              <div className="text-sm text-slate-700">
                Connected to <b>{status?.organizationName}</b> ({status?.region ? ZOHO_REGIONS[status.region].label : ''}).
              </div>

              <div>
                <label className={label}>Invoice numbers</label>
                <div className="space-y-2 text-sm">
                  <label className="flex items-start gap-2">
                    <input type="radio" checked={settings.numbering.mode === 'zoho'} onChange={() => setSettings({ ...settings, numbering: { ...settings.numbering, mode: 'zoho' } })} className="mt-1" />
                    <span>Let Zoho number them <span className="text-slate-500">(uses the series set in Zoho → Settings → Preferences → Invoices)</span></span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" checked={settings.numbering.mode === 'template'} onChange={() => setSettings({ ...settings, numbering: { ...settings.numbering, mode: 'template' } })} className="mt-1" />
                    <span>Use our own series, continuing from what is already in Zoho</span>
                  </label>
                  {settings.numbering.mode === 'template' && (
                    <div className="pl-6">
                      <input className={input} value={settings.numbering.template} onChange={(e) => setSettings({ ...settings, numbering: { ...settings.numbering, template: e.target.value } })} placeholder="FFDS/{FY}/" />
                      <p className={`text-xs mt-1 ${templateProblem ? 'text-red-600' : 'text-slate-500'}`}>
                        {templateProblem || <>The next one would read <b className="font-mono">{preview}</b>. {'{FY}'} becomes the financial year (1 April to 31 March) and resets the count each year.</>}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={label}>HSN/SAC · design invoices</label>
                  <input className={`${input} font-mono`} value={settings.hsnDesign} onChange={(e) => setSettings({ ...settings, hsnDesign: e.target.value })} />
                </div>
                <div>
                  <label className={label}>HSN/SAC · execution invoices</label>
                  <input className={`${input} font-mono`} value={settings.hsnExecution} onChange={(e) => setSettings({ ...settings, hsnExecution: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Zoho item name · design</label>
                  <input className={input} value={settings.designItemName} onChange={(e) => setSettings({ ...settings, designItemName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Zoho item name · execution</label>
                  <input className={input} value={settings.executionItemName} onChange={(e) => setSettings({ ...settings, executionItemName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Payment terms (days)</label>
                  <input className={input} type="number" min={0} max={100} placeholder="Use the customer's terms in Zoho" value={settings.paymentTermsDays ?? ''}
                    onChange={(e) => setSettings({ ...settings, paymentTermsDays: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                GST is split by place of supply: CGST + SGST when the client is in the same state as your GSTIN in Studio Settings, IGST otherwise.
                The items above are looked up in Zoho by name and created once if they are missing.
              </p>

              <div className="flex items-center gap-3">
                <button disabled={busy || !!templateProblem} onClick={save} className="px-5 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-40 transition-colors">
                  {busy ? 'Saving…' : 'Save settings'}
                </button>
                {savedAt && <span className="text-sm text-emerald-700 font-semibold">Saved</span>}
                <button disabled={busy} onClick={disconnect} className="ml-auto px-4 py-2.5 rounded-xl border border-red-200 text-red-700 text-sm font-bold hover:bg-red-50 transition-colors">
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ZohoBooksCard;

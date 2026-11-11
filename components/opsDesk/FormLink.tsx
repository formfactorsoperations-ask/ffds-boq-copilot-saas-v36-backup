import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Check, Globe, RefreshCw, ExternalLink, X } from '@/lib/lucide-shim';
import { Glide } from '../people/PeopleBits';
import { publicAppOrigin } from '../../lib/publicUrl';
import { embedCode, formLink, newFormToken, type LeadFormSettings } from '../../lib/leadForm';
import type { LeadSource } from '../../lib/leads';
import { memberRoles, hasRole } from '../../lib/roles';
import { opsSettingsOf } from '../../lib/opsDesk';
import { useOrg } from '../../contexts/OrgContext';
import '../projectHeader/projectHeader.css';

/*
  The public enquiry form's link (lib/leadForm.ts): switch it on, choose who
  new enquiries go to, copy the link for the website or Instagram, or the code
  to put the form inside the studio's own site. Shown in Studio settings →
  Ops Desk, and from the Leads board's "Website form link".
*/

const random = (n: number) => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
};

const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
const field = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-sm text-slate-700 outline-none font-mono';
const btnSec = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50';

export function FormLinkPanel({ settings, tenantId, team, canEdit, onChange }: {
  settings: LeadFormSettings;
  tenantId: string;
  team: { email?: string; name?: string; role?: string; roles?: string[] }[];
  canEdit: boolean;
  onChange: (next: LeadFormSettings) => void;
}) {
  const [where, setWhere] = useState<LeadSource>('website');
  const [copied, setCopied] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const origin = publicAppOrigin();
  const link = settings.token ? formLink(origin, settings.token, where) : '';
  const people = team.filter((m) => m?.email && memberRoles(m).some((r) => ['Client Relations', 'Ops Director', 'Owner', 'Admin'].includes(r)));

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1800);
    } catch { /* the field can still be selected by hand */ }
  };
  const turn = (on: boolean) => onChange({ ...settings, enabled: on, token: settings.token || (on && tenantId ? newFormToken(tenantId, random) : '') });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <span className="pp-tile w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0]"><Globe className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">Take enquiries from a public form</p>
          <p className="text-xs text-slate-500">Anyone with the link can send an enquiry; each one becomes a lead on the Ops Desk with a first step to call within the hour.</p>
        </div>
        <button type="button" role="switch" aria-checked={settings.enabled} aria-label="Take enquiries from a public form" disabled={!canEdit || !tenantId}
          onClick={() => turn(!settings.enabled)}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors disabled:opacity-50 ${settings.enabled ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
          <span className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: settings.enabled ? 'translateX(20px)' : undefined }} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {settings.enabled && settings.token && (
          <motion.div key="on" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={label}>The link</span>
                  <span className="ml-auto"><Glide id="form-where" label="Where you will share it" value={where} onChange={setWhere}
                    options={[{ id: 'website', label: 'Website' }, { id: 'instagram', label: 'Instagram' }, { id: 'referral', label: 'Referrals' }, { id: 'other', label: 'Elsewhere' }]} /></span>
                </div>
                <div className="flex gap-2">
                  <input readOnly aria-label="Form link" className={field} value={link} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className={btnSec} onClick={() => copy('link', link)}>{copied === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}{copied === 'link' ? 'Copied' : 'Copy'}</button>
                  <a className={btnSec} href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" />Open</a>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Leads from this link are marked {where === 'website' ? 'Website' : where === 'instagram' ? 'Instagram' : where === 'referral' ? 'Referral' : 'Other'}.</p>
              </div>
              <div>
                <p className={`${label} mb-1.5`}>To put the form inside your website</p>
                <div className="flex gap-2">
                  <input readOnly aria-label="Embed code" className={field} value={embedCode(origin, settings.token)} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className={btnSec} onClick={() => copy('embed', embedCode(origin, settings.token))}>{copied === 'embed' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}{copied === 'embed' ? 'Copied' : 'Copy code'}</button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Give this to whoever looks after the website; it goes where the form should appear.</p>
              </div>
              <label className="flex flex-col gap-1.5 max-w-md">
                <span className={label}>Who gets new enquiries</span>
                <select disabled={!canEdit} value={settings.ownerEmail} onChange={(e) => onChange({ ...settings, ownerEmail: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50">
                  <option value="">Client Relations, whoever has the fewest new leads</option>
                  {people.map((m) => <option key={String(m.email)} value={String(m.email).toLowerCase()}>{m.name || m.email}</option>)}
                </select>
                <span className="text-[11px] text-slate-500">They get an email for each one, and it is at the top of their Today list.</span>
              </label>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  {!renewing ? (
                    <button type="button" className={btnSec} onClick={() => setRenewing(true)}><RefreshCw className="w-3.5 h-3.5" />Make a new link</button>
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      The old link stops working once this is saved.
                      <button type="button" className={btnSec} onClick={() => { onChange({ ...settings, token: newFormToken(tenantId, random) }); setRenewing(false); }}>Make it</button>
                      <button type="button" aria-label="Cancel" className="p-1 text-slate-400" onClick={() => setRenewing(false)}><X className="w-4 h-4" /></button>
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500">Bots are turned away by a hidden field, a minimum time to fill in, and a limit per hour.</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The same, from the Leads board: a lead changes it here at once; Client Relations sees the link to share. */
export function FormLinkSheet({ onClose }: { onClose: () => void }) {
  const { orgData, updateOrgData, currentRole, currentRoles } = useOrg() as any;
  const roles = currentRoles?.length ? currentRoles : [currentRole];
  const canEdit = hasRole(roles, ['Super Admin', 'Owner', 'Admin', 'Ops Director']);
  const settings = opsSettingsOf(orgData);
  const [error, setError] = useState<string | null>(null);
  const save = async (leadForm: LeadFormSettings) => {
    setError(null);
    try { await updateOrgData({ opsDesk: { ...settings, leadForm } }); } catch { setError('That was not saved. Try again.'); }
  };
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-label="Website form link">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Leads</p>
            <h3 className="font-bold text-slate-800 mt-1">Website form link</h3>
            <p className="text-xs text-slate-500 mt-0.5">A form for your website, Instagram bio or a QR code. Every enquiry lands on this board.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {!canEdit && !settings.leadForm.enabled ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">The form is not switched on yet. An Owner, Admin or Ops Director switches it on here or in Studio settings → Ops Desk.</p>
          ) : (
            <FormLinkPanel settings={settings.leadForm} tenantId={String(orgData?.tenantId || '')} team={(orgData?.team as any[]) || []} canEdit={canEdit} onChange={save} />
          )}
          {error && <p className="mt-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}

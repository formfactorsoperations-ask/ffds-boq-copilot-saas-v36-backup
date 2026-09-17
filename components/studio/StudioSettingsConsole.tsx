/*
  Studio settings.

  What this replaced put thirty-eight fields behind six accordions titled
  things like "Studio Profile, Branding & Signatory Authority", all shut by
  default, with three separate save buttons and no way to tell which fields
  were still empty. Finding the GSTIN meant opening each section and reading.
  Editing branding and then switching tabs lost the edit silently. The audit
  log at the bottom was three hardcoded rows with invented timestamps.

  The rebuild keeps every field and changes how you reach them: one search that
  jumps to any setting, a rail that shows where the gaps are, one draft with
  one save, and a dial that reports how close this studio is to being able to
  issue a correct contract and a valid tax invoice.

  Fields are described in lib/settingsRegistry.ts rather than only in markup
  here, so the search, the rail and the dial all read the same list.
*/

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOrg } from '../../contexts/OrgContext';
import { uploadPlanImage } from '../../services/planStorage';
import { downscalePlanToBase64 } from '../../lib/imageDownscale';
import { connectGoogleCalendar, isGoogleCalendarConnected } from '../../services/googleCalendarService';
import { CountUp, Dot } from '../ui/HudBits';
import StudioTeamSection from './StudioTeamSection';
import ConsoleHeader from '../ui/ConsoleHeader';
import {
  SETTINGS_SECTIONS, SETTINGS_FIELDS, SectionId, SettingsField,
  assessReadiness, searchSettings, readField,
} from '../../lib/settingsRegistry';
import { TeamMember } from '../../types';
import {
  Save, Building2, Users, CreditCard, Scale, Globe, Palette,
  Database, Check, AlertTriangle, Upload, RotateCcw,
} from 'lucide-react';

const SECTION_ICON: Record<SectionId, React.ComponentType<any>> = {
  identity: Building2,
  team: Users,
  financial: CreditCard,
  contract: Scale,
  portal: Globe,
  appearance: Palette,
  system: Database,
};

/** Personalization lives in localStorage, not the org document — it is per device. */
function applyPersonalization(font: string, theme: string, compact: boolean) {
  localStorage.setItem('ffds_global_font', font);
  localStorage.setItem('ffds_global_theme', theme);
  localStorage.setItem('ffds_compact_mode', compact ? 'true' : 'false');
  document.documentElement.classList.toggle('dark', theme === 'dark-blue');
  document.body.classList.toggle('layout-compact', compact);
  window.dispatchEvent(new Event('ffds_personalization_change'));
}

/** Set a possibly-dotted key on a plain object, without mutating the original. */
function writeField(obj: any, key: string, value: any): any {
  const parts = key.split('.');
  const next = { ...obj };
  let node = next;
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]] = { ...(node[parts[i]] || {}) };
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  return next;
}

interface FieldProps {
  field: SettingsField;
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
  multiline?: boolean;
  type?: string;
  placeholder?: string;
  highlight?: boolean;
}

const Field: React.FC<FieldProps> = ({ field, value, onChange, disabled, multiline, type, placeholder, highlight }) => {
  const empty = value === undefined || value === null || String(value).trim() === '';
  const missingRequired = empty && field.criticality === 'required';
  const Input: any = multiline ? 'textarea' : 'input';

  return (
    <div
      id={`set-${field.key.replace(/\./g, '-')}`}
      className={`rounded-xl transition-shadow ${highlight ? 'ring-2 ring-[#3D52A0] ring-offset-2 hud-locate' : ''}`}
    >
      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
        {field.label}
        {field.criticality === 'required' && (
          <span className={missingRequired ? 'text-rose-600' : 'text-slate-300'}>required</span>
        )}
      </label>
      <Input
        type={type || 'text'}
        rows={multiline ? 3 : undefined}
        value={value ?? ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e: any) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] disabled:bg-slate-50 ${
          missingRequired ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300'
        }`}
      />
      {/* The consequence sits with the field, not in a tooltip: it is the reason
          to fill it in, and it is only useful at the moment of deciding. */}
      {field.consequence && (
        <p className={`text-[11px] mt-1 ${missingRequired ? 'text-rose-700' : 'text-slate-500'}`}>
          {field.consequence}
        </p>
      )}
    </div>
  );
};

const Panel: React.FC<{ id: SectionId; title: string; blurb: string; missing: number; children: React.ReactNode }> =
  ({ id, title, blurb, missing, children }) => {
    const Icon = SECTION_ICON[id];
    return (
      <section id={`section-${id}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in scroll-mt-24">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              {title}
              {missing > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold uppercase tracking-wider">
                  {missing} missing
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
          </div>
        </div>
        {children}
      </section>
    );
  };

export default function StudioSettingsConsole(props: {
  /** The settings/templates switcher, rendered inside the header. */
  tabs?: React.ReactNode;
  onDownloadBackup?: () => void;
  onImportProject?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearProject?: () => void;
  confirmReset?: boolean;
}) {
  const { orgData, updateOrgData, currentRole, currentUserAuth } = useOrg();
  const canEdit = ['Admin', 'Ops Director', 'Super Admin'].includes(currentRole as string);
  const tenantId = orgData?.tenantId || 'demo-tenant-01';

  const [draft, setDraft] = useState<any>(() => ({ ...(orgData || {}) }));
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('identity');
  const [q, setQ] = useState('');
  const [jumpKey, setJumpKey] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(() => {
    try { return isGoogleCalendarConnected(); } catch { return false; }
  });

  const dirty = dirtyKeys.size > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /*
    The org document arrives after first paint and can change under us. Adopting
    it while there are unsaved edits would wipe what the user is typing, so it
    is only adopted when the draft is clean.
  */
  useEffect(() => {
    if (!dirtyRef.current) setDraft({ ...(orgData || {}) });
  }, [orgData]);

  const setField = useCallback((key: string, value: any) => {
    setDraft((d: any) => writeField(d, key, value));
    setDirtyKeys((prev) => new Set(prev).add(key));
    setSavedAt(null);
  }, []);

  const readiness = useMemo(() => assessReadiness(draft), [draft]);
  const results = useMemo(() => searchSettings(q), [q]);

  /* Warn before leaving with unsaved edits — the old screen lost them silently. */
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const jumpTo = (field: SettingsField) => {
    setActiveSection(field.section);
    setQ('');
    setJumpKey(field.key);
    // Let the section render before scrolling to the field inside it.
    requestAnimationFrame(() => {
      const el = document.getElementById(`set-${field.key.replace(/\./g, '-')}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => setJumpKey(null), 2000);
    });
  };

  const save = async () => {
    if (!canEdit || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Only the keys actually touched, so a stale draft cannot overwrite a
      // field somebody else changed while this screen was open.
      const patch: any = {};
      for (const key of dirtyKeys) {
        const top = key.split('.')[0];
        patch[top] = draft[top];
      }

      const entry = {
        at: Date.now(),
        by: currentUserAuth?.email || 'unknown',
        what: Array.from(dirtyKeys)
          .map((k) => SETTINGS_FIELDS.find((f) => f.key === k)?.label || k)
          .slice(0, 6)
          .join(', '),
      };
      const log = [entry, ...((orgData as any)?.settingsAuditLog || [])].slice(0, 20);

      await updateOrgData({ ...patch, settingsAuditLog: log } as any);
      setDirtyKeys(new Set());
      setSavedAt(Date.now());
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft({ ...(orgData || {}) });
    setDirtyKeys(new Set());
    setSaveError(null);
  };

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const b64 = await downscalePlanToBase64(file);
      const url = await uploadPlanImage(tenantId, b64, 'branding');
      setField('orgLogo', url);
    } catch (err: any) {
      setSaveError(`Logo upload failed: ${err?.message || err}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const fieldsOf = (section: SectionId) => SETTINGS_FIELDS.filter((f) => f.section === section);
  const f = (key: string) => SETTINGS_FIELDS.find((x) => x.key === key)!;

  const bind = (key: string, extra: Partial<FieldProps> = {}) => ({
    field: f(key),
    value: readField(draft, key),
    onChange: (v: any) => setField(key, v),
    disabled: !canEdit,
    highlight: jumpKey === key,
    ...extra,
  });

  // Appearance is per-device and applies immediately, so it is not part of the draft.
  const [font, setFont] = useState(() => localStorage.getItem('ffds_global_font') || 'jakarta');
  const [theme, setTheme] = useState(() => localStorage.getItem('ffds_global_theme') || 'milky-white');
  const [compact, setCompact] = useState(() => localStorage.getItem('ffds_compact_mode') === 'true');

  if (!canEdit) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-5 py-4 max-w-2xl">
        <p className="font-bold">Studio settings are not open to your role.</p>
        <p className="text-sm mt-1">You are signed in as {currentRole || 'an unknown role'}.</p>
      </div>
    );
  }

  const tone = readiness.pct === 100 ? 'ok' : readiness.pct >= 60 ? 'warn' : 'bad';

  return (
    <div className="pb-28">
      {/* ---------------------------------------------------------- header */}
      <ConsoleHeader
        title={orgData?.orgName || 'Untitled studio'}
        state={saving ? 'Saving' : dirty ? 'Unsaved' : readiness.pct === 100 ? 'Complete' : 'Incomplete'}
        tone={saving || dirty ? 'warn' : tone}
        live={saving}
        blurb="Everything this studio prints, charges and signs in."
        tabs={props.tabs}
        search={{
          value: q,
          onChange: setQ,
          placeholder: 'Search settings — try GSTIN, signatory, UPI…',
          results: q ? (
            <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">Nothing matches “{q}”.</p>
              ) : (
                results.slice(0, 7).map((field, i) => {
                  const empty = !readField(draft, field.key);
                  return (
                    <button
                      key={field.key}
                      onClick={() => jumpTo(field)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 hud-row-in"
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      <span>
                        <span className="text-sm font-semibold text-slate-800">{field.label}</span>
                        <span className="block text-[11px] text-slate-500">
                          {SETTINGS_SECTIONS.find((sec) => sec.id === field.section)?.label}
                        </span>
                      </span>
                      {empty && field.criticality === 'required' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 shrink-0">empty</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ) : null,
        }}
        gauge={{
          pct: readiness.pct,
          label: 'Ready to issue',
          sub: `${readiness.requiredFilled} of ${readiness.requiredTotal} required settings`,
        }}
        aside={readiness.missingRequired.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-slate-200 max-w-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Still needed</p>
            <div className="flex flex-wrap gap-1.5">
              {readiness.missingRequired.slice(0, 6).map((field, i) => (
                <button
                  key={field.key}
                  onClick={() => jumpTo(field)}
                  className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 hud-row-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {field.label}
                </button>
              ))}
              {readiness.missingRequired.length > 6 && (
                <span className="px-2 py-1 text-[11px] text-slate-500">
                  +{readiness.missingRequired.length - 6} more
                </span>
              )}
            </div>
          </div>
        ) : null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
        {/* ------------------------------------------------------------ rail */}
        <nav className="lg:sticky lg:top-4 space-y-1">
          {SETTINGS_SECTIONS.map((s, i) => {
            const Icon = SECTION_ICON[s.id];
            const stats = readiness.bySection[s.id];
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors hud-row-in ${
                  isActive ? 'bg-[#3D52A0] text-white shadow-sm hud-rail-active' : 'text-slate-700 hover:bg-slate-100'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold flex-1 min-w-0 truncate">{s.label}</span>
                {stats?.missingRequired > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {stats.missingRequired}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* --------------------------------------------------------- content */}
        <div key={activeSection} className="space-y-6 min-w-0 hud-swap">
          {activeSection === 'identity' && (
            <Panel id="identity" title="Studio identity" blurb={SETTINGS_SECTIONS[0].blurb}
                   missing={readiness.bySection.identity?.missingRequired || 0}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field {...bind('orgName')} placeholder="Form Factors Design Studio" />
                <Field {...bind('legalName')} placeholder="Form Factors Design LLP" />
                <Field {...bind('tagline')} placeholder="Interiors that work" />
                <Field {...bind('contactEmail')} type="email" placeholder="studio@example.in" />
                <Field {...bind('contactPhone')} placeholder="+91 …" />
                <Field {...bind('cityState')} placeholder="Mumbai, Maharashtra" />
                <div className="md:col-span-2"><Field {...bind('officeAddress')} multiline /></div>
                <Field {...bind('website')} placeholder="https://…" />
                <Field {...bind('instagramUrl')} placeholder="https://instagram.com/…" />
                <div className="md:col-span-2"><Field {...bind('about')} multiline /></div>
                <div className="md:col-span-2">
                  <Field {...bind('credentials')} placeholder="RIBA, IIID — comma separated" />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-4">
                  Who signs contracts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field {...bind('signatoryName')} placeholder="Full name" />
                  <Field {...bind('signatoryTitle')} placeholder="Principal Architect" />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">Logo</h3>
                <div className="flex items-center gap-4 flex-wrap">
                  {draft.orgLogo
                    ? <img src={draft.orgLogo} alt="Studio logo" className="h-12 object-contain border border-slate-200 rounded-lg px-3 py-1 bg-white" />
                    : <span className="text-sm text-slate-500">No logo set</span>}
                  <label className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLogo ? 'Uploading…' : draft.orgLogo ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogo} disabled={uploadingLogo} />
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Stored in Firebase Storage and referenced by URL — a logo pasted into the studio
                  record is carried by every read of it.
                </p>
              </div>
            </Panel>
          )}

          {activeSection === 'team' && (
            <Panel id="team" title="Team & roles" blurb={SETTINGS_SECTIONS[1].blurb} missing={0}>
              <StudioTeamSection
                team={(draft.team as TeamMember[]) || []}
                onChange={(t) => setField('team', t)}
                currentEmail={currentUserAuth?.email || undefined}
                tenantId={tenantId}
                canEdit={canEdit}
              />
            </Panel>
          )}

          {activeSection === 'financial' && (
            <Panel id="financial" title="Money" blurb={SETTINGS_SECTIONS[2].blurb}
                   missing={readiness.bySection.financial?.missingRequired || 0}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field {...bind('gstin')} placeholder="27ABCDE1234F1Z5" />
                <Field {...bind('defaultGstRate')} type="number" />
                <Field {...bind('designFeePercentage')} type="number" />
              </div>
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-4">
                  Where clients pay
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field {...bind('bankDetails.accountName')} />
                  <Field {...bind('bankDetails.bankName')} />
                  <Field {...bind('bankDetails.accountNumber')} />
                  <Field {...bind('bankDetails.ifscCode')} />
                  <Field {...bind('bankDetails.upiId')} placeholder="studio@okhdfcbank" />
                </div>
              </div>
            </Panel>
          )}

          {activeSection === 'contract' && (
            <Panel id="contract" title="Contract terms" blurb={SETTINGS_SECTIONS[3].blurb}
                   missing={readiness.bySection.contract?.missingRequired || 0}>
              <div className="space-y-4">
                <Field {...bind('defaultContractWordings.paymentTermsText')} multiline />
                <Field {...bind('defaultContractWordings.revisionsText')} multiline />
                <Field {...bind('defaultContractWordings.forceMajeureText')} multiline />
                <Field {...bind('defaultContractWordings.clientObsText')} multiline />
                <div className="md:w-64">
                  <Field {...bind('procurementLeadTimeWeeks')} type="number" />
                </div>
              </div>
            </Panel>
          )}

          {activeSection === 'portal' && (
            <Panel id="portal" title="Client portal" blurb={SETTINGS_SECTIONS[4].blurb}
                   missing={readiness.bySection.portal?.missingRequired || 0}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field {...bind('businessHours')} placeholder="Mon–Sat, 10am–7pm" />
                <Field {...bind('pmResponseTime')} placeholder="Within one working day" />
                <div className="md:col-span-2"><Field {...bind('siteVisitPolicy')} multiline /></div>
                <div className="md:col-span-2"><Field {...bind('escalationPolicy')} multiline /></div>
              </div>
            </Panel>
          )}

          {activeSection === 'appearance' && (
            <Panel id="appearance" title="Appearance" blurb={SETTINGS_SECTIONS[5].blurb}
                   missing={readiness.bySection.appearance?.missingRequired || 0}>
              <p className="text-xs text-slate-500 mb-5">
                These apply to this browser only and take effect immediately — they are not part of
                the studio record, so they are not saved with everything else.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Typeface</label>
                  <select value={font}
                          onChange={(e) => { setFont(e.target.value); applyPersonalization(e.target.value, theme, compact); }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                    <option value="jakarta">Plus Jakarta Sans</option>
                    <option value="opensans">Open Sans</option>
                    <option value="playfair">Playfair Display</option>
                    <option value="system">System default</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Palette</label>
                  <select value={theme}
                          onChange={(e) => { setTheme(e.target.value); applyPersonalization(font, e.target.value, compact); }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white">
                    <option value="milky-white">Milky white</option>
                    <option value="dark-blue">Dark blue</option>
                    <option value="light-blue">Light blue</option>
                    <option value="light-orange">Warm orange</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Compact tables</p>
                    <p className="text-xs text-slate-500">Tighter rows in the BOQ and schedule of finishes.</p>
                  </div>
                  <button
                    onClick={() => { const v = !compact; setCompact(v); applyPersonalization(font, theme, v); }}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${compact ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}
                    aria-pressed={compact}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${compact ? 'left-6.5' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="md:col-span-2 md:w-64">
                  <Field {...bind('themeColor')} type="color" />
                </div>
              </div>
            </Panel>
          )}

          {activeSection === 'system' && (
            <Panel id="system" title="Data & integrations" blurb={SETTINGS_SECTIONS[6].blurb} missing={0}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={props.onDownloadBackup}
                        className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50">
                  <p className="text-sm font-bold text-slate-800">Download a backup</p>
                  <p className="text-xs text-slate-500 mt-0.5">Every project as one JSON file.</p>
                </button>
                <label className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer block">
                  <p className="text-sm font-bold text-slate-800">Restore from a backup</p>
                  <p className="text-xs text-slate-500 mt-0.5">Import projects from a JSON file.</p>
                  <input type="file" accept="application/json" className="hidden" onChange={props.onImportProject} />
                </label>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">
                  Google Calendar
                </h3>
                <div className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {calendarConnected ? 'Connected' : 'Not connected'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Site visits and design reviews are written to the studio calendar.
                    </p>
                  </div>
                  {!calendarConnected && (
                    <button
                      onClick={async () => {
                        try {
                          await connectGoogleCalendar();
                          setCalendarConnected(isGoogleCalendarConnected());
                        } catch (e: any) {
                          setSaveError(`Calendar connection failed: ${e?.message || e}`);
                        }
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-white"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>

              {/* Destructive, and the only thing on this screen that is — kept
                  visually apart rather than sitting in the same row as a backup. */}
              <div className="mt-6 pt-6 border-t border-rose-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-rose-700 mb-3">
                  Danger zone
                </h3>
                <div className="flex items-center justify-between gap-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-rose-900">Clear all project data</p>
                    <p className="text-xs text-rose-700">
                      Removes every project in this studio. Take a backup first — this cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={props.onClearProject}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 whitespace-nowrap"
                  >
                    {props.confirmReset ? 'Click again to confirm' : 'Clear data'}
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">
                  Recent settings changes
                </h3>
                {((orgData as any)?.settingsAuditLog || []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nothing recorded yet. Changes saved from this screen are listed here.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {((orgData as any).settingsAuditLog as any[]).map((e, i) => (
                      <li key={i} className="py-2.5 flex items-start justify-between gap-4 hud-row-in"
                          style={{ animationDelay: `${Math.min(i, 12) * 24}ms` }}>
                        <span className="text-slate-700 min-w-0">{e.what || 'Settings updated'}</span>
                        <span className="text-xs text-slate-400 shrink-0">
                          {e.by} · {new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- save bar */}
      {(dirty || saving || savedAt || saveError) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto rounded-2xl border border-slate-300 bg-white/95 backdrop-blur shadow-xl px-5 py-3 flex items-center justify-between gap-4 hud-dock-in">
            <div className="flex items-center gap-3 min-w-0">
              {saveError ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="text-sm text-rose-700 truncate">{saveError}</span>
                </>
              ) : savedAt && !dirty ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-slate-700">Saved</span>
                </>
              ) : (
                <>
                  <Dot tone="warn" live={saving} />
                  <span className="text-sm text-slate-700">
                    <span key={dirtyKeys.size} className="hud-tick font-bold">{dirtyKeys.size}</span> unsaved change{dirtyKeys.size === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {dirty && !saving && (
                <button onClick={discard}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-50 flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5" /> Discard
                </button>
              )}
              <button onClick={save} disabled={!dirty || saving}
                      className="px-5 py-2 rounded-xl bg-[#3D52A0] text-white font-bold text-sm hover:bg-[#334486] disabled:opacity-50 flex items-center gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FolderOpen, Loader2 } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { DRIVE_ADMIN_ROLES, ROOT_FOLDER, type DriveStatus } from '../../lib/googleDrive';
import { driveStatus, connectDrive, disconnectDrive, NOT_DEPLOYED } from '../../services/googleDriveService';

/**
 * Studio Settings → Google Drive.
 *
 * The studio connects its main Google account once. Then every drawing for
 * the client that the Design Head approves is copied, landscape, into
 * "Studio Desk / <Project>" in that Drive, shared as view-only by link, and
 * the link goes into the approval email (lib/googleDrive). The app can reach
 * only the folders and files it made, nothing else in the account.
 */

const short = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const GoogleDriveCard: React.FC = () => {
  const { orgData, currentRole } = useOrg();
  const tenantId: string | undefined = orgData?.tenantId;
  const canManage = DRIVE_ADMIN_ROLES.has(String(currentRole || ''));
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The googleDrive function is not deployed yet: say so, with the command, rather than "internal". */
  const [missing, setMissing] = useState(false);
  /* Back from Google: ?drive=connected | cancelled | error. Said once, then taken out of the address. */
  const [returned, setReturned] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('drive');
    if (!r) return;
    setReturned(r);
    setOpen(true);
    p.delete('drive');
    const q = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
  }, []);
  useEffect(() => {
    if (!tenantId) return;
    driveStatus(tenantId).then(setStatus).catch((e) => (e?.code === NOT_DEPLOYED ? setMissing(true) : setError(e?.message || 'Could not check Google Drive.')));
  }, [tenantId]);

  const run = async (fn: () => Promise<DriveStatus | void>) => {
    setBusy(true); setError(null);
    try { const next = await fn(); if (next) setStatus(next); } catch (e: any) { if (e?.code === NOT_DEPLOYED) setMissing(true); else setError(e?.message || 'Something went wrong.'); } finally { setBusy(false); }
  };
  const connected = !!status?.connected;
  const pill = connected
    ? <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">Connected</span>
    : <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">Off</span>;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-100/60 transition-colors text-left">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700 shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2"><h3 className="text-base font-bold text-slate-900">Google Drive</h3>{pill}</div>
            <p className="text-xs text-slate-500 mt-0.5">
              {connected ? `Drawings you pick are uploaded to ${status?.email || 'your Drive'}` : 'Upload the drawings you pick to a Drive folder per project, and put its link in the approval email.'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-6 md:p-8 space-y-5">
          {returned === 'connected' && connected && (
            <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>Google Drive is connected.</span></div>
          )}
          {(returned === 'error' || returned === 'cancelled') && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{returned === 'cancelled' ? 'Google Drive was not connected: the access was not allowed.' : status?.lastError?.message || 'Google Drive could not be connected. Try again.'}</span></div>
          )}

          <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <CheckCircle className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
            <span>
              When operations send a client the approval email, they tick which of the meeting's drawings to upload. Only those are copied,
              landscape, into <b>My Drive / {ROOT_FOLDER} / &lt;Project&gt;</b>. Nothing is copied by itself.
              That folder is shared as <b>view-only to anyone with the link</b>, and the link goes into the approval email.
              Studio-only drawings are never copied. The app can see only the folders and files it made, nothing else in the account.
            </span>
          </div>

          {missing && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                The Google Drive service is not on the server yet. Once the OAuth client ID and secret are saved as secrets, deploy it once
                with <code className="font-mono text-xs bg-white/70 px-1 rounded">firebase deploy --only functions:googleDrive,functions:driveOAuthCallback</code>, then reload this page.
              </span>
            </div>
          )}

          {connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-700">
                Connected to <b>{status?.email}</b>{status?.connectedBy ? ` by ${status.connectedBy}` : ''}{status?.connectedAt ? `, ${short(status.connectedAt)}` : ''}.
              </div>
              {canManage && (
                <button disabled={busy} onClick={() => { if (window.confirm('Disconnect Google Drive? The folders and files already in Drive stay there, and their links keep working. New approvals will not be copied.')) void run(() => disconnectDrive(tenantId)); }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Disconnect</button>
              )}
            </div>
          ) : canManage ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Sign in with the studio's main Google account. Google may say the app is unverified: choose <b>Advanced → Go to</b> the app; it is your studio's own.</p>
              <button disabled={busy || !tenantId} onClick={() => void run(async () => { await connectDrive(tenantId); })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3D52A0] text-white text-sm font-bold hover:bg-[#334486] disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}Connect Google Drive
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-600">The studio's Owner or an Admin connects Google Drive.</p>
          )}

          {connected && status?.lastError && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Last copy that did not go through ({short(status.lastError.at)}): {status.lastError.message}</span></div>
          )}
          {error && <div className="flex items-start gap-2 text-sm text-rose-800 bg-rose-50 border border-rose-100 rounded-xl p-3"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
      )}
    </div>
  );
};

export default GoogleDriveCard;

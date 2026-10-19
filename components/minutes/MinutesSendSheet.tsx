import React, { useMemo, useState } from 'react';
import { Eye, MessageCircle, Mail, Lock, Send, ShieldCheck, Clock, Loader2 } from '@/lib/lucide-shim';
import { allLines, lineRefs, type MinutesContent, type Signed, type TrailEntry } from '../../lib/minutes';
import { Panel, Trail, BRAND_EYEBROW, input, btnPri, btnSec } from './MinutesBits';

/*
  SENDING AFTER APPROVAL (mockup 4).

  Only approved minutes can be sent. The client portal always gets them;
  WhatsApp and email (with the PDF) are on by default. The record on the right
  is kept on every MoM.
*/

const EMAIL_RX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const split = (s: string) => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

export interface SendChoice {
  whatsapp: { on: boolean; phone: string; message: string };
  email: { on: boolean; to: string[]; cc: string[]; subject: string; body: string };
}

export interface SendSheetProps {
  momRef: string;
  rev?: number;
  clientName: string;
  clientPhone?: string | null;
  clientEmails: string[];
  studioCc: string[];
  studioName: string;
  senderName: string;
  portalUrl: string;
  meetingTitle: string;
  content: MinutesContent;
  approvedBy?: Signed | null;
  trail?: TrailEntry[];
  onSend: (choice: SendChoice) => Promise<void>;
  onPreview: () => void;
  onClose: () => void;
}

const fmt = (ms: number) => new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function MinutesSendSheet(p: SendSheetProps) {
  const refs = useMemo(() => lineRefs(p.content.topics), [p.content.topics]);
  const lines = allLines(p.content.topics).map((x) => x.line).filter((l) => l.text.trim());
  const decisions = lines.filter((l) => l.kind === 'decision').length;
  const steps = lines.filter((l) => refs[l.id]?.startsWith('A')).length;
  const greet = p.clientName ? `Hello ${p.clientName}` : 'Hello';
  const revised = (p.rev || 0) > 0;

  const [wa, setWa] = useState({
    on: !!p.clientPhone,
    phone: p.clientPhone || '',
    message: `${greet}, the ${revised ? 'revised ' : ''}minutes of ${p.meetingTitle ? `our ${p.meetingTitle.toLowerCase()}` : 'our meeting'} are in your portal: ${decisions} decision${decisions === 1 ? '' : 's'} and ${steps} next step${steps === 1 ? '' : 's'}. Please confirm them, or tell us what to correct. ${p.portalUrl}\n— ${p.senderName}, ${p.studioName}`,
  });
  const [mail, setMail] = useState({
    on: p.clientEmails.length > 0,
    to: p.clientEmails.join(', '),
    cc: p.studioCc.join(', '),
    subject: `${revised ? 'Revised minutes' : 'Minutes of our meeting'}${p.meetingTitle ? `: ${p.meetingTitle}` : ''} (${p.momRef}${revised ? ` Rev ${(p.rev || 0) + 1}` : ''})`,
    body: [
      `${p.clientName ? `Dear ${p.clientName},` : 'Hello,'}`,
      revised ? `Here are the revised minutes${p.content.revisionNote ? `. What changed: ${p.content.revisionNote}` : ''}. They replace the earlier version.` : 'Thank you for your time. The minutes of our meeting are attached and in your portal.',
      p.content.summary || '',
      'Please confirm them in your portal, or mark any line that is not as you remember it and we will correct it.',
      `Warm regards,\n${p.senderName}\n${p.studioName}`,
    ].filter(Boolean).join('\n\n'),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badTo = split(mail.to).filter((e) => !EMAIL_RX.test(e));
  const badCc = split(mail.cc).filter((e) => !EMAIL_RX.test(e));
  const emailOk = !mail.on || (split(mail.to).length > 0 && !badTo.length && !badCc.length);
  const waOk = !wa.on || wa.phone.replace(/\D/g, '').length >= 10;
  const channels = ['Portal', wa.on && 'WhatsApp', mail.on && 'email'].filter(Boolean).join(' · ');

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await p.onSend({
        whatsapp: wa,
        email: { on: mail.on, to: split(mail.to), cc: split(mail.cc), subject: mail.subject, body: mail.body },
      });
    } catch (e: any) {
      setError(e?.message || 'The minutes could not be sent. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[310] flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Send minutes ${p.momRef}`}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={busy ? undefined : p.onClose} />
      <div className="relative w-full max-w-[1120px] grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] items-start overflow-y-auto max-h-full">
        <div className="phd-pop rounded-3xl border border-slate-200 shadow-2xl bg-white overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <p className={BRAND_EYEBROW}>Send minutes · {p.momRef}{revised ? ` · Rev ${(p.rev || 0) + 1}` : ''}</p>
            <h3 className="text-lg font-bold text-slate-800">Send to {p.clientName || 'the client'}</h3>
            {p.approvedBy && (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2 text-xs text-emerald-800">
                <ShieldCheck className="w-4 h-4" /><b>Approved by {p.approvedBy.name}</b> · {fmt(p.approvedBy.at)}
              </div>
            )}
          </div>
          <div className="px-6 pb-5 space-y-3">
            <Channel icon={Eye} title="Client portal" blurb="Shows under “Minutes to confirm”, with the PDF" locked />
            <Channel icon={MessageCircle} title="WhatsApp" blurb={wa.phone ? `To ${wa.phone}` : 'No phone number on the project'} on={wa.on} onToggle={() => setWa((x) => ({ ...x, on: !x.on }))}>
              <input className={`${input} mb-2`} value={wa.phone} onChange={(e) => setWa((x) => ({ ...x, phone: e.target.value }))} placeholder="+91 98765 43210" aria-label="WhatsApp number" />
              <textarea className={`${input} min-h-[96px] text-xs leading-relaxed`} value={wa.message} onChange={(e) => setWa((x) => ({ ...x, message: e.target.value }))} aria-label="WhatsApp message" />
              <p className="text-[11px] text-slate-500 mt-1">Opens WhatsApp with this message; on a phone the PDF goes with it.</p>
            </Channel>
            <Channel icon={Mail} title="Email with the PDF" blurb={mail.to ? `To ${mail.to}` : 'No client email on the project'} on={mail.on} onToggle={() => setMail((x) => ({ ...x, on: !x.on }))}>
              <div className="space-y-2">
                <input className={input} value={mail.to} onChange={(e) => setMail((x) => ({ ...x, to: e.target.value }))} placeholder="client@example.com" aria-label="To" />
                <input className={input} value={mail.cc} onChange={(e) => setMail((x) => ({ ...x, cc: e.target.value }))} placeholder="Cc" aria-label="Cc" />
                {(badTo.length > 0 || badCc.length > 0) && <p className="text-[11px] text-rose-700">Check: {[...badTo, ...badCc].join(', ')}</p>}
                <input className={input} value={mail.subject} onChange={(e) => setMail((x) => ({ ...x, subject: e.target.value }))} aria-label="Subject" />
                <textarea className={`${input} min-h-[140px] text-xs leading-relaxed`} value={mail.body} onChange={(e) => setMail((x) => ({ ...x, body: e.target.value }))} aria-label="Email" />
              </div>
            </Channel>
            {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
          </div>
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex flex-wrap items-center gap-3">
            <button type="button" className={btnSec} onClick={p.onPreview}><Eye className="w-4 h-4" />Preview PDF</button>
            <span className="flex-1" />
            <button type="button" className={btnSec} onClick={p.onClose} disabled={busy}>Cancel</button>
            <button type="button" className={btnPri} onClick={send} disabled={busy || !emailOk || !waOk}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send to {channels}
            </button>
          </div>
        </div>
        <Panel icon={Clock} title="What happens to these minutes" blurb="The record on every MoM, newest first">
          <Trail trail={p.trail} />
        </Panel>
      </div>
    </div>
  );
}

function Channel({ icon: I, title, blurb, on = true, locked, onToggle, children }: {
  icon: React.ComponentType<any>; title: string; blurb: string; on?: boolean; locked?: boolean; onToggle?: () => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3.5 transition-colors ${on ? 'border-[#3D52A0]/40 bg-[#3D52A0]/[0.03]' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center shrink-0"><I className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-800">{title}</p><p className="text-xs text-slate-500 truncate">{blurb}</p></div>
        {locked ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500"><Lock className="w-3.5 h-3.5" />Always</span> : (
          <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={onToggle}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors ${on ? 'bg-[#3D52A0]' : 'bg-slate-300'}`}>
            <span className="block w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(16px)' : undefined }} />
          </button>
        )}
      </div>
      {on && children && <div className="mt-3 sm:ml-11">{children}</div>}
    </div>
  );
}


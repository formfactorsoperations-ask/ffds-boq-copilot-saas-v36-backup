import React, { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Loader2, Send, Copy, Paperclip, Link2, AlertTriangle, Check } from 'lucide-react';
import { MOM } from '../../types';
import { getAi } from '../../services/aiClient';
import { FLASH_MODEL } from '../../constants/aiModels';
import { sendMomEmail } from '../../services/emailService';

/*
  THE SUMMARY EMAIL THAT GOES OUT WITH A MoM.

  The studio used to share minutes as a PDF on WhatsApp with a one-line note
  ("4 decisions, 5 action items"), leaving the client to work out what it meant
  for them. This drafts a short covering note from the minutes themselves --
  what was agreed, what the studio will do and by when, and what is needed from
  the client -- in the studio's voice, in one of three tones. Everything is
  editable; nothing is sent until the studio presses Send.
*/

type Tone = 'warm' | 'formal' | 'short';
const TONE_LABEL: Record<Tone, string> = { warm: 'Warm', formal: 'Formal', short: 'Short' };
const TONE_BRIEF: Record<Tone, string> = {
  warm: 'Warm and personal, like a principal architect writing to a client they like. Plain words.',
  formal: 'Courteous and formal, suitable for a record. No slang, no exclamation marks.',
  short: 'Very brief: a two-line opener, then only the essential bullets. No more than 90 words.',
};

const EMAIL_RX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const splitEmails = (s: string) => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
/** "Sunday, 11 October at 11:00 am" from the next-meeting fields. */
const fmtNext = (n?: MOM['nextMeeting']) => {
  if (!n?.date) return '';
  const d = new Date(`${n.date}T${n.time || '00:00'}`);
  if (isNaN(d.getTime())) return n.date;
  const day = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return n.time ? `${day} at ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : day;
};

interface Props {
  mom: MOM;
  visit: any | null;
  projectName: string;
  clientName?: string;
  clientEmail?: string;
  studioName: string;
  signerName: string;
  getPdf: () => Promise<{ filename: string; base64: string } | null>;
  getAckLink: () => Promise<string>;
  onSent: (recipients: string[]) => Promise<void>;
  onClose: () => void;
}

/** The facts the email is written from, in plain text. */
function factsOf(mom: MOM, projectName: string, clientName?: string) {
  const owner = (a: any) => a.ownerName || (a.owner === 'ffds' ? 'Studio' : a.owner === 'client' ? 'Client' : a.owner === 'vendor' ? 'Vendor' : 'Unassigned');
  const lines: string[] = [];
  lines.push(`Project: ${projectName}${clientName ? ` (client: ${clientName})` : ''}`);
  lines.push(`Meeting: ${mom.meetingTitle || 'Meeting'} on ${new Date(mom.meetingDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} (${mom.momRef})`);
  if (mom.rev) lines.push(`These are REVISED minutes (Rev ${mom.rev}), replacing the earlier version. What changed: ${mom.revisionNote || 'corrections to the earlier version'}`);
  if (mom.summary) lines.push(`Summary: ${mom.summary}`);
  (mom.decisions || []).filter((d) => d.text?.trim()).forEach((d) => lines.push(`Decision: ${d.text}`));
  (mom.actionItems || []).filter((a) => a.text?.trim()).forEach((a) =>
    lines.push(`Action (${a.owner === 'client' ? 'client' : 'studio/vendor'}): ${a.text} -- owner ${owner(a)}${a.dueDate ? `, due ${fmtDate(a.dueDate)}` : ''}`));
  (mom.carriedForward || []).forEach((c) => lines.push(`Still open from ${c.ref}: ${c.text}`));
  if (mom.nextMeeting?.date) lines.push(`Next meeting: ${fmtNext(mom.nextMeeting)}${mom.nextMeeting.purpose ? ` -- ${mom.nextMeeting.purpose}` : ''}`);
  return lines.join('\n');
}

/** A sensible note without AI: shown at once, and kept if the AI is unavailable. */
function templateNote(mom: MOM, clientName: string | undefined, signer: string, studio: string): { subject: string; body: string } {
  const greet = clientName ? `Dear ${clientName},` : 'Hello,';
  const agreed = (mom.decisions || []).filter((d) => d.text?.trim()).map((d) => `- ${d.text}`);
  const ours = (mom.actionItems || []).filter((a) => a.text?.trim() && a.owner !== 'client')
    .map((a) => `- ${a.text}${a.dueDate ? ` (by ${fmtDate(a.dueDate)})` : ''}`);
  const theirs = (mom.actionItems || []).filter((a) => a.text?.trim() && a.owner === 'client')
    .map((a) => `- ${a.text}${a.dueDate ? ` (by ${fmtDate(a.dueDate)})` : ''}`);
  const parts = [
    greet,
    mom.rev
      ? `Here are the revised minutes (${mom.momRef} Rev ${mom.rev})${mom.revisionNote ? `. What changed: ${mom.revisionNote}` : ''}. They replace the earlier version, and the full minutes are attached.`
      : `Thank you for your time${mom.meetingTitle ? ` at "${mom.meetingTitle}"` : ''}. Here is a short summary; the full minutes (${mom.momRef}) are attached.`,
    mom.summary || '',
    agreed.length ? `What we agreed:\n${agreed.join('\n')}` : '',
    ours.length ? `What we will do next:\n${ours.join('\n')}` : '',
    theirs.length ? `What we need from you:\n${theirs.join('\n')}` : '',
    mom.nextMeeting?.date ? `Our next meeting is on ${fmtNext(mom.nextMeeting)}${mom.nextMeeting.purpose ? `, for ${mom.nextMeeting.purpose.toLowerCase()}` : ''}.` : '',
    'If anything here does not match your understanding, please reply within 48 hours and we will correct it.',
    `Warm regards,\n${signer}\n${studio}`,
  ].filter(Boolean);
  const ref = `${mom.momRef}${mom.rev ? ` Rev ${mom.rev}` : ''}`;
  return { subject: `${mom.rev ? 'Revised minutes' : 'Minutes of our meeting'}${mom.meetingTitle ? `: ${mom.meetingTitle}` : ''} (${ref})`, body: parts.join('\n\n') };
}

export function MomEmailComposer({
  mom, visit, projectName, clientName, clientEmail, studioName, signerName, getPdf, getAckLink, onSent, onClose,
}: Props) {
  // Who it goes to: the client side of the meeting in To, the studio in CC.
  const initial = useMemo(() => {
    const people: any[] = visit?.people || [];
    const to = new Set<string>();
    const cc = new Set<string>();
    const vendorMeeting = String(mom.meetingType || '').includes('vendor');
    people.forEach((p) => {
      const e = String(p?.email || '').trim();
      if (!EMAIL_RX.test(e)) return;
      if (p.side === 'client' || (vendorMeeting && p.side === 'vendor')) to.add(e);
      else if (p.side === 'ffds') cc.add(e);
    });
    if (!people.length && clientEmail && EMAIL_RX.test(clientEmail)) to.add(clientEmail);
    return { to: [...to].join(', '), cc: [...cc].filter((e) => !to.has(e)).join(', ') };
  }, [visit, clientEmail, mom.meetingType]);

  const fallback = useMemo(() => templateNote(mom, clientName, signerName, studioName), [mom, clientName, signerName, studioName]);
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [subject, setSubject] = useState(fallback.subject);
  const [body, setBody] = useState(fallback.body);
  const [tone, setTone] = useState<Tone>('warm');
  const [drafting, setDrafting] = useState(false);
  const [attachPdf, setAttachPdf] = useState(true);
  const [includeLink, setIncludeLink] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [edited, setEdited] = useState(false);

  const draftWithAi = async (t: Tone) => {
    setDrafting(true);
    setError(null);
    try {
      const prompt = `You write the covering email that goes out with the minutes of a meeting, for ${studioName}, an interior design studio in India. Write as ${signerName}.

Tone: ${TONE_BRIEF[t]}

Use ONLY these facts. Do not invent dates, amounts, people or promises.
${factsOf(mom, projectName, clientName)}

If these are revised minutes, say so plainly in the opening lines, name the revision number, and say what changed; do not repeat the thanks for the meeting.

Structure: a one-line greeting${clientName ? ` to ${clientName}` : ''}; one or two sentences of thanks and context, saying the full minutes are attached; then short sections, each a heading line followed by "- " bullets: "What we agreed", "What we will do next" (studio and vendor actions with dates), and "What we need from you" (client actions; leave the section out if there are none). Mention the next meeting if there is one. End by asking them to reply within 48 hours if anything does not match their understanding, then sign off with ${signerName} and ${studioName}. Plain text only, blank line between paragraphs, no markdown symbols other than "- " bullets.

Return JSON: {"subject": "...", "body": "..."}`;
      const res = await getAi().models.generateContent({
        model: FLASH_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json', temperature: 0.4 },
      });
      const json = JSON.parse(String(res.text || '{}').replace(/```json\n?|```/g, '').trim());
      if (json?.body) {
        setBody(String(json.body).trim());
        if (json.subject) setSubject(String(json.subject).trim());
        setEdited(false);
      }
    } catch (e: any) {
      console.warn('MoM email draft failed', e);
      setError('The AI draft could not be made, so a standard note is shown. You can still edit and send it.');
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => { draftWithAi('warm'); /* first draft on open */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickTone = (t: Tone) => {
    setTone(t);
    draftWithAi(t);
  };

  const toList = splitEmails(to);
  const ccList = splitEmails(cc);
  const badEmail = [...toList, ...ccList].find((e) => !EMAIL_RX.test(e));

  const finalBody = async () => {
    if (!includeLink) return body;
    const link = await getAckLink();
    return `${body.trim()}\n\nTo acknowledge the minutes or ask for a correction: ${link}`;
  };

  const send = async () => {
    if (!toList.length) { setError('Add at least one recipient in To.'); return; }
    if (badEmail) { setError(`"${badEmail}" is not a valid email address.`); return; }
    if (!subject.trim() || !body.trim()) { setError('The subject and message cannot be empty.'); return; }
    setSending(true);
    setError(null);
    try {
      const pdf = attachPdf ? await getPdf() : null;
      const res = await sendMomEmail({ to: toList, cc: ccList, subject: subject.trim(), body: await finalBody(), pdf });
      if (!res.success) throw new Error(res.error || 'The email service refused the message.');
      await onSent([...toList, ...ccList]);
      setSent([...toList, ...ccList]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(/domain is not verified/i.test(msg)
        ? 'Not sent: the studio\'s sending address is on a domain the email service has not verified. Verify the studio\'s domain in Resend and set EMAIL_FROM to an address on it. Until then, use Copy for WhatsApp.'
        : `Not sent: ${msg}. If this keeps happening, check that the sendStudioEmail function is deployed with its email secrets.`);
    } finally {
      setSending(false);
    }
  };

  const copyForWhatsApp = async () => {
    const text = (await finalBody()).replace(/^(What we agreed|What we will do next|What we need from you)$/gm, '*$1*');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError('Could not copy. Select the message text and copy it manually.'); }
  };

  const input = 'w-full bg-transparent text-sm text-slate-900 outline-none placeholder-slate-400';

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden font-sans">
        <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">{sent ? 'Minutes sent' : 'Send the minutes'}</h3>
            <p className="text-[12.5px] text-slate-500 truncate">{mom.momRef} · {mom.meetingTitle || 'Meeting'} · {projectName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        {sent ? (
          <div className="px-6 pb-6 space-y-3">
            <p className="text-sm text-emerald-900 bg-emerald-50 rounded-xl px-4 py-3 flex gap-2"><Check size={16} className="shrink-0 mt-0.5" />Sent to {sent.join(', ')}. The MoM is marked as shared, and the client can acknowledge it from the link.</p>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[#3D52A0] text-white text-sm font-bold">Done</button></div>
          </div>
        ) : (
          <>
            <div className="px-5 sm:px-6 divide-y divide-slate-100 border-y border-slate-100">
              <label className="flex items-center gap-3 py-2.5"><span className="w-14 text-xs font-semibold text-slate-500">To</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@email.com" className={input} aria-label="To" /></label>
              <label className="flex items-center gap-3 py-2.5"><span className="w-14 text-xs font-semibold text-slate-500">CC</span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="team@studio.com" className={input} aria-label="CC" /></label>
              <label className="flex items-center gap-3 py-2.5"><span className="w-14 text-xs font-semibold text-slate-500">Subject</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${input} font-semibold`} aria-label="Subject" /></label>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex gap-1 p-1 bg-slate-100/80 rounded-xl" role="radiogroup" aria-label="Tone">
                  {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={tone === t} disabled={drafting} onClick={() => pickTone(t)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] transition ${tone === t ? 'bg-white text-[#2C3C78] font-bold shadow-[0_1px_3px_rgba(20,26,51,0.12)]' : 'text-slate-600 font-medium hover:text-slate-900'}`}>{TONE_LABEL[t]}</button>
                  ))}
                </div>
                <span className="text-[12px] text-slate-500 flex items-center gap-1.5">
                  {drafting ? <><Loader2 size={13} className="animate-spin" />Drafting…</> : <><Sparkles size={13} className="text-[#3D52A0]" />{edited ? 'Edited by you' : 'Drafted by AI from the minutes'}</>}
                </span>
              </div>
              <textarea value={body} onChange={(e) => { setBody(e.target.value); setEdited(true); }} rows={14} aria-label="Message"
                className={`w-full bg-slate-50/70 rounded-xl px-4 py-3 text-[14px] leading-relaxed text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-[#3D52A0]/10 border border-transparent focus:border-[#3D52A0]/30 transition resize-y ${drafting ? 'opacity-60' : ''}`} />
              <div className="flex flex-wrap gap-2">
                <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] cursor-pointer border ${attachPdf ? 'bg-[#E8ECFB] border-[#3D52A0]/30 text-[#2C3C78]' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="sr-only" /><Paperclip size={13} />MoM_{mom.momRef}{mom.rev ? `_Rev${mom.rev}` : ''}.pdf
                </label>
                <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] cursor-pointer border ${includeLink ? 'bg-[#E8ECFB] border-[#3D52A0]/30 text-[#2C3C78]' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input type="checkbox" checked={includeLink} onChange={(e) => setIncludeLink(e.target.checked)} className="sr-only" /><Link2 size={13} />Link to acknowledge or correct
                </label>
              </div>
              {!toList.length && <p className="text-[12.5px] text-amber-800 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-px" />No client email on this meeting. Add one in To.</p>}
              {error && <p role="alert" className="text-[12.5px] text-rose-800 bg-rose-50 rounded-xl px-3 py-2 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-px" />{error}</p>}
            </div>

            <div className="px-5 sm:px-6 py-3.5 bg-[#3D52A0] flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={onClose} disabled={sending} className="px-3 py-2 text-sm font-semibold text-[#E3E8FB] hover:text-white rounded-xl">Cancel</button>
              <button type="button" onClick={copyForWhatsApp} disabled={sending || drafting} className="px-3.5 py-2 text-sm font-bold text-white border border-white/45 rounded-xl hover:bg-white/10 flex items-center gap-2">
                {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy for WhatsApp'}
              </button>
              <button type="button" onClick={send} disabled={sending || drafting} className="px-4 py-2 text-sm font-extrabold text-[#2C3C78] bg-white rounded-xl hover:bg-[#F2F4FD] disabled:opacity-60 flex items-center gap-2">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending…' : `Send${toList.length ? ` to ${toList.length}` : ''}${ccList.length ? ` · CC ${ccList.length}` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

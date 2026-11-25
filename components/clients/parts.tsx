import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/lib/lucide-shim';
import type { FullProjectData } from '../../types';
import { coverCandidates } from '../../lib/coverPhoto';
import { stageOfProject } from '../../lib/projectFolders';
import { ProjectPhoto } from '../projects/journey/parts';
import type { TemplateId } from '../../lib/clientNextMove';
import type { PortalLine } from '../../lib/portalVisits';

/*
  The small pieces the Clients screen shares (DESIGN.md "Clients:
  conversations", approved 25 Nov 2026): the client's photo, the Actual /
  Dummy sticker, the message templates and the side drawer.
*/

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** The client's photo: their project's cover, in the same order as Projects (lib/coverPhoto). */
export function ClientPhoto({ project, className }: { project: FullProjectData | undefined; className?: string }) {
  const photos = coverCandidates(project?.context as any, 480).map((c) => c.url).filter(Boolean) as string[];
  return (
    <span className={cx('pj block shrink-0', className)}>
      <ProjectPhoto row={{ photo: photos[0] || null, photos, stage: stageOfProject(project) }} label={false} className="w-full h-full rounded-[inherit]" />
    </span>
  );
}

/** The Actual / Dummy sticker, with the look and motion recorded under "Stickers". */
export function KindSticker({ isDummy }: { isDummy: boolean }) {
  const tip = isDummy ? 'Dummy: test project, practice data' : 'Real client';
  const slap = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.classList.remove('slap');
    void el.offsetWidth;
    el.classList.add('slap');
  };
  return (
    /* Inside .pj, so it stops under prefers-reduced-motion with the Projects stickers. */
    <span className="pj inline-flex">
      <span role="img" tabIndex={0} className="pj-stk" style={{ ['--r' as any]: '-3deg' }} data-tip={tip} aria-label={`${isDummy ? 'Dummy' : 'Actual'}. ${tip}`} onClick={slap}>
        <span className={cx('pj-face', isDummy && 'dummy')}>{isDummy ? 'Dummy' : 'Actual'}</span><span className="pj-fold" />
      </span>
    </span>
  );
}

/** The four WhatsApp templates. The ids are kept: Next move and the follow-up log name them. */
export const WHATSAPP_TEMPLATES: { id: TemplateId; title: string; text: (client: string, studio: string, project: string) => string }[] = [
  {
    id: 'update',
    title: 'Site & Design Update',
    text: (c, s, p) => `Hi ${c}, greetings from ${s}! Sharing a quick progress update regarding your ${p} interior project.`,
  },
  {
    id: 'review',
    title: 'Drawings / BOQ Review',
    text: (c, _s, p) => `Hi ${c}, we've prepared the latest drawing set and BOQ specifications for ${p}. Let us know when convenient to review together.`,
  },
  {
    id: 'milestone',
    title: 'Payment Milestone Check-in',
    text: (c, _s, p) => `Hi ${c}, sharing the milestone update and statement for ${p}. Please let us know if you need any clarification on the items.`,
  },
  {
    id: 'touchpoint',
    title: 'General Studio Follow-up',
    text: (c, s, p) => `Hi ${c}, checking in from ${s} regarding ${p}. Let's connect this week to discuss next steps.`,
  },
];

/** A wa.me link for an Indian number (ten digits get the 91), or null with no phone. */
export function whatsAppLink(phone: string, text: string): string | null {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "4 days ago". */
export function daysAgo(at: number, now: number): string {
  const d = Math.max(0, Math.floor((now - at) / DAY));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Short, for the list: "Today", "Yesterday", "3d", "12 Nov". */
export function whenShort(at: number, now: number): string {
  const d = Math.max(0, Math.floor((now - at) / DAY));
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** A drawer from the right over a scrim (the card below 1024px, the dossier). Escape closes it. */
export function SideDrawer({ label, onClose, children, width = 'max-w-[380px]' }: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[250]" role="dialog" aria-modal="true" aria-label={label}>
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <aside className={cx('phd-drawer absolute top-0 right-0 bottom-0 w-full bg-white border-l border-slate-200 shadow-2xl flex flex-col', width)}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl text-slate-500 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/** The "on the portal now" dot: brand, breathing with the project sidebar's keyframe; still under reduced motion. */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cx('inline-block w-2 h-2 rounded-full bg-[#3D52A0] shrink-0 animate-[psb-breathe_2.4s_infinite] motion-reduce:animate-none', className)} />;
}

/** A portal status line (lib/portalVisits portalStatus): brand when on now, amber when not opened or no access, slate otherwise. */
export function PortalLineText({ line, prefix, className }: { line: PortalLine; prefix?: string | null; className?: string }) {
  const tone = line.tone === 'brand' ? 'text-[#3D52A0]' : line.tone === 'warn' ? 'text-amber-700' : 'text-slate-500';
  const [head, ...rest] = line.text.split(' · ');
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs', tone, className)}>
      {line.live && <LiveDot />}
      <span className="min-w-0">
        {prefix && <span className="text-slate-500">{prefix}: </span>}
        <b className="font-bold">{head}</b>{rest.length ? ` · ${rest.join(' · ')}` : ''}
      </span>
    </span>
  );
}

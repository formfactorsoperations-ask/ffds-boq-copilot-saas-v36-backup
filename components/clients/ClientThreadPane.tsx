import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageCircle, PanelRight, ArrowUpRight } from '@/lib/lucide-shim';
import { Button, INPUT, LABEL, Segmented } from '../ui/kit';
import { stageOfProject } from '../../lib/projectFolders';
import type { FullProjectData } from '../../types';
import type { ClientRow } from '../../lib/clientList';
import type { TemplateId } from '../../lib/clientNextMove';
import { StageChip } from '../projects/journey/parts';
import { ClientPhoto, KindSticker, WHATSAPP_TEMPLATES, daysAgo, whatsAppLink } from './parts';

/*
  The middle pane (DESIGN.md "Clients: conversations"): the client's header,
  their projects, and the message to send next from a template.

  The thread of what was sent, what the client did and what was logged comes
  next, from records the studio already keeps; until then this pane shows the
  projects it will be built from.
*/

export default function ClientThreadPane({ row, now, studioName, onOpenProject, onBack, onDetails }: {
  row: ClientRow;
  now: number;
  studioName: string;
  onOpenProject: (project: FullProjectData, targetTab?: string) => void;
  /** Below 768px: back to the list. */
  onBack: () => void;
  /** Below 1024px: the client card, as a drawer. */
  onDetails: () => void;
}) {
  const c = row.client;
  const home = row.primary?.context?.name || 'Untitled project';
  const projects = useMemo(
    () => [row.primary, ...c.projects.filter((p) => p.id !== row.primary.id)],
    [c.projects, row.primary],
  );

  /* The template Next move suggests is chosen first; the message follows the template and the project. */
  const [template, setTemplate] = useState<TemplateId>(row.nextMove.template);
  const [projectId, setProjectId] = useState(row.primary.id);
  const [text, setText] = useState('');
  useEffect(() => { setTemplate(row.nextMove.template); setProjectId(row.primary.id); }, [c.clientKey, row.nextMove.template, row.primary.id]);
  const project = projects.find((p) => p.id === projectId) || row.primary;
  useEffect(() => {
    const t = WHATSAPP_TEMPLATES.find((x) => x.id === template) || WHATSAPP_TEMPLATES[0];
    setText(t.text(c.clientName, studioName, project?.context?.name || 'your interior project'));
  }, [template, project?.id, c.clientName, studioName]);

  const link = whatsAppLink(c.clientPhone, text);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <button type="button" onClick={onBack} aria-label="Back to clients" className="md:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <ClientPhoto project={row.primary} className="w-11 h-11 rounded-xl overflow-hidden" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900 truncate">{c.clientName}</h2>
          <p className="text-xs text-slate-500 truncate">
            {home} · {row.lastContactAt != null ? `last contact ${daysAgo(row.lastContactAt, now)}` : 'no contact logged yet'}
          </p>
        </div>
        <span className="hidden sm:inline-flex"><KindSticker isDummy={c.isDummy} /></span>
        <Button size="sm" icon={PanelRight} onClick={onDetails} className="lg:hidden">Details</Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 bg-slate-50/60">
        <p className={LABEL}>{projects.length === 1 ? 'Project' : 'Projects'}</p>
        {projects.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-3 py-2.5 hud-row-in" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
            <ClientPhoto project={p} className="w-12 h-9 rounded-lg overflow-hidden" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{p.context?.name || 'Untitled project'}</p>
              <p className="text-[11px] text-slate-500 truncate">
                {[p.context?.config, p.context?.location].filter(Boolean).join(' · ') || 'No details yet'}
                {p.lastModified ? ` · updated ${daysAgo(p.lastModified, now)}` : ''}
              </p>
            </div>
            <span className="hidden sm:inline-flex"><StageChip stage={stageOfProject(p)} /></span>
            <Button size="sm" variant="quiet" icon={ArrowUpRight} onClick={() => onOpenProject(p)}>Open</Button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 p-3 space-y-2.5 bg-white">
        <Segmented<TemplateId> label="Message template" size="sm" value={template} onChange={setTemplate}
          options={WHATSAPP_TEMPLATES.map((t) => ({ id: t.id, label: t.title }))} />
        <div className="flex flex-col xl:flex-row gap-2.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Message"
            className={`${INPUT} resize-none flex-1`} />
          <div className="flex flex-wrap items-center xl:flex-col xl:items-stretch xl:flex-nowrap gap-2 xl:w-48 shrink-0">
            {projects.length > 1 && (
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="About which project" className={`${INPUT} !py-1.5 text-xs`}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.context?.name || 'Untitled project'}</option>)}
              </select>
            )}
            <Button variant="primary" icon={MessageCircle} disabled={!link || !text.trim()}
              title={link ? 'Opens WhatsApp with this message' : 'Add a phone number first'}
              onClick={() => link && window.open(link, '_blank', 'noopener,noreferrer')}>
              Open in WhatsApp
            </Button>
            {!c.clientPhone && (
              <button type="button" onClick={() => onOpenProject(row.primary)} className="text-xs font-bold text-[#3D52A0] hover:underline self-center">
                Add phone
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

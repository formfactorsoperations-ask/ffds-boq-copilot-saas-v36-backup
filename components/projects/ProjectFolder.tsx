/*
  One project on the Projects desk, as a glass folder (DESIGN.md "Projects as
  glass folders", plan item 10).

  Everything is one click: the glass opens the project; hovering fans out the
  files, and a file opens that screen; the button on the glass does the next
  step; ··· holds the rest, and lists the files too for a touch screen with no
  hover. The flag on the tab names the stage and waves; a lost project's hangs.
*/
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, MoreHorizontal } from 'lucide-react';
import GlassFolder from '../ui/glass-folder-cards';
import { STAGE, toneOf, KIND_LABEL, type FolderStage, type KindTag, type RoutedFile, type FolderNext } from '../../lib/projectFolders';
import { PenTool } from 'lucide-react';
import { BOQ_TAG_LABEL, type BoqTag } from '../../lib/playground/versions';

const STEPS = ['Lead', 'Quote', 'Won', 'Site', 'Done'];
/* The folder is drawn at 340 wide with 54 of headroom above it (glass-folder-cards). */
const BASE_W = 340;
const HEADROOM = 54;

export interface ProjectFolderProps {
  key?: React.Key;
  id: string;
  name: string;
  meta: string;
  client: string;
  designer?: string;
  stage: FolderStage;
  kind: KindTag;
  /** BOQ Playground: how the latest BOQ was made. Shown while the studio's Playground switch is on. */
  boq?: BoqTag;
  files: RoutedFile[];
  next: FolderNext | null;
  width: number;
  index: number;
  active?: boolean;
  selected?: boolean;
  /** Open the project, at a screen when one is given. */
  onOpen: (route?: string) => void;
  onChangeStage?: () => void;
  onDuplicate?: () => void;
  onToggleSelect?: () => void;
  onDelete?: () => void;
}

export default function ProjectFolder(p: ProjectFolderProps) {
  const stage = STAGE[p.stage];
  const k = p.width / BASE_W;
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const menuRef = useRef<HTMLDivElement>(null);

  /* Hover fans the files out after a beat, so passing over the desk does not set every folder moving. */
  const enter = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 110); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { setOpen(false); setMenu(false); }, 180); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const go = (route?: string) => { setMenu(false); p.onOpen(route); };

  return (
    <article
      className={`pf-item${p.stage === 'lost' ? ' is-lost' : ''}${p.active ? ' is-active' : ''}${p.selected ? ' is-selected' : ''}`}
      style={{ animationDelay: `${Math.min(p.index, 8) * 55}ms`, ['--fc' as any]: stage.color }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      data-testid={`project-folder-${p.id}`}
    >
      <div className="pf-tags" style={{ top: Math.round(((HEADROOM + 34) * p.width) / BASE_W) - 30, left: Math.round(12 * k) }}>
        <span className={`pf-kind ${p.kind}`}>{KIND_LABEL[p.kind]}</span>
        {p.boq && (
          <span className={`pf-boq ${p.boq}`} title="How the project's latest BOQ was made. Classic BOQs open as they are; their next version can be a Playground version.">
            {p.boq === 'playground' && <PenTool className="w-3 h-3" aria-hidden />}{BOQ_TAG_LABEL[p.boq]}
          </span>
        )}
        {p.next?.flag && p.next.tone !== 'brand' && (
          <span className={`pf-flag ${p.next.tone}`} title={p.next.flag}>{p.next.flag}</span>
        )}
      </div>

      {/* One click on the glass opens the project: the folder's own open/close is taken over by hover. */}
      <div
        className="pf-fold"
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('.gf-hit')) {
            e.stopPropagation();
            e.preventDefault();
            go();
          }
        }}
      >
        <div
          className={`pf-pole${p.stage === 'lost' ? ' limp' : ''}`}
          style={{ right: Math.round(30 * k), top: Math.round(HEADROOM * k) - 48 }}
          aria-hidden
        >
          <span className="pf-mast" />
          <span className="pf-cloth"><span>{stage.label}</span></span>
        </div>
        <GlassFolder
          label={p.name}
          meta={p.meta}
          art="none"
          seed={(p.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 97) + 1}
          tone={toneOf(p.stage)}
          files={p.files}
          width={p.width}
          appearDelay={Math.min(p.index, 8) * 70}
          action="none"
          open={open}
          onOpenChange={(o) => { if (!o) setOpen(false); }}
          onFileSelect={(_, i) => go(p.files[i]?.route)}
        />
        <div className="pf-quick" style={{ top: Math.round((HEADROOM + 74 + 32 + 14) * k), right: Math.round(18 * k) }}>
          {p.next && (
            <button type="button" className={`pf-next ${p.next.tone}`} onClick={() => go(p.next!.route)} title={p.next.flag || p.next.label}>
              <span>{p.next.label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" className="pf-more" aria-label={`More for ${p.name}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menu && (
            <div ref={menuRef} className="pf-menu" role="menu" aria-label={`${p.name} options`}>
              <button type="button" role="menuitem" onClick={() => go()}>Open project<ArrowUpRight className="w-3.5 h-3.5" /></button>
              {p.files.length > 0 && <small>Go to</small>}
              {p.files.map((f) => (
                <button type="button" role="menuitem" key={f.name} onClick={() => go(f.route)}>{f.name}<span>{f.meta}</span></button>
              ))}
              {(p.onChangeStage || p.onDuplicate || p.onToggleSelect || p.onDelete) && <small>Manage</small>}
              {p.onChangeStage && <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onChangeStage!(); }}>Change stage</button>}
              {p.onDuplicate && <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onDuplicate!(); }}>Clone as template</button>}
              {p.onToggleSelect && <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onToggleSelect!(); }}>{p.selected ? 'Unselect' : 'Select'}</button>}
              {p.onDelete && <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); p.onDelete!(); }}>Delete</button>}
            </div>
          )}
        </div>
      </div>

      <footer className="pf-foot">
        <div className="pf-who">
          <b>{p.client}</b>
          <span>{stage.label}{p.designer ? ` · ${p.designer}` : ''}</span>
        </div>
        <div className="pf-steps" aria-label={`Stage: ${stage.label}`}>
          {STEPS.map((s, i) => (
            <i key={s} title={s} className={i < stage.step ? 'd' : i === stage.step ? 'n' : ''} />
          ))}
        </div>
      </footer>
    </article>
  );
}

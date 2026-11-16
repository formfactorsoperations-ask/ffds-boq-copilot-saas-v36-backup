/*
  Projects as glass folders (DESIGN.md "Projects as glass folders", plan item 10).

  Everything a folder shows that is worked out rather than drawn: which stage a
  project is in and that stage's colour and art, the Actual / Dummy tag, the
  files inside (each one a screen of the project, one click away), and the next
  step on the glass, which is the project's own top action from
  services/nextActionEngine.
*/
import type { ArtRecipe, FolderFile } from '../components/ui/glass-folder-cards';
import type { NextAction } from '../services/nextActionEngine';
import { classifyProject } from './projectClassification';

export type FolderStage = 'lead' | 'proposal' | 'won' | 'execution' | 'completed' | 'lost';

export interface StageDef {
  id: FolderStage;
  label: string;
  /** The stage colour: the flag, the glow under the folder, the swatch on its tab. */
  color: string;
  /** The art behind the folder's glass, painted in the stage's colours. */
  art: ArtRecipe;
  /** Step on the five-step bar (Lead, Quote, Won, Site, Done); -1 when lost. */
  step: number;
}

export const FOLDER_STAGES: StageDef[] = [
  { id: 'lead', label: 'New lead', color: '#0284c7', step: 0,
    art: { style: 'streak', colors: ['#f0f9ff', '#bae6fd', '#38bdf8', '#e0f2fe', '#7dd3fc', '#ffffff'], scale: 0.7, warp: 1.6, angle: 0.3, gloss: 0.3 } },
  { id: 'proposal', label: 'Proposal sent', color: '#3D52A0', step: 1,
    art: { style: 'marble', colors: ['#0f1330', '#26346a', '#3D52A0', '#7091E6', '#c7d2fe', '#eef2ff'], scale: 0.7, warp: 3.2, angle: 0.6, gloss: 0.5, veins: 0.4 } },
  { id: 'won', label: 'Won', color: '#B8923A', step: 2,
    art: { style: 'marble', colors: ['#1a1408', '#5c4410', '#B8923A', '#e3c378', '#fbf2d6', '#2a2216'], scale: 0.68, warp: 3.4, angle: 2.0, gloss: 0.6, veins: 0.5 } },
  { id: 'execution', label: 'On site', color: '#c2410c', step: 3,
    art: { style: 'streak', colors: ['#fff7ed', '#fdba74', '#ea580c', '#7c2d12', '#fed7aa', '#fffaf5'], scale: 0.7, warp: 1.4, angle: -0.6, gloss: 0.25 } },
  { id: 'completed', label: 'Handed over', color: '#047857', step: 4,
    art: { style: 'marble', colors: ['#07110c', '#173024', '#3f7a5c', '#141812', '#8fbf9f', '#dcefe3', '#f6fbf7'], scale: 0.72, warp: 3.0, angle: 1.2, gloss: 0.45, veins: 0.4 } },
  { id: 'lost', label: 'Lost', color: '#64748b', step: -1,
    art: { style: 'streak', colors: ['#e9eaee', '#c9ccd4', '#9aa0ad', '#dfe1e6', '#f4f5f7'], scale: 0.7, warp: 1.2, angle: 0.1, gloss: 0.1 } },
];

export const STAGE: Record<FolderStage, StageDef> = Object.fromEntries(
  FOLDER_STAGES.map((s) => [s.id, s]),
) as Record<FolderStage, StageDef>;

/** The stored status, folded into the six stages a folder can show. */
export function stageOf(status?: string | null): FolderStage {
  switch (status) {
    case 'proposal_sent':
    case 'negotiation':
      return 'proposal';
    case 'won':
      return 'won';
    case 'execution':
    case 'work_paused':
      return 'execution';
    case 'completed':
    case 'archived':
      return 'completed';
    case 'lost':
      return 'lost';
    default:
      return 'lead'; // lead, draft, and anything not yet set
  }
}

/** Dark glass where the stage art is dark, so the name stays readable. */
export const toneOf = (stage: FolderStage): 'light' | 'dark' =>
  stage === 'proposal' || stage === 'won' ? 'dark' : 'light';

export type KindTag = 'actual' | 'dummy' | 'untagged';

/** The Actual / Dummy tag, from the project's own tag (lib/projectClassification). */
export function kindOf(project: any): KindTag {
  const k = classifyProject(project);
  return k === 'test' ? 'dummy' : k;
}

export const KIND_LABEL: Record<KindTag, string> = { actual: 'Actual', dummy: 'Dummy', untagged: 'Untagged' };

/** A file in the folder, and the screen of the project it opens. */
export type RoutedFile = FolderFile & { route: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const isPicture = (url?: string) => !!url && /\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(url);

/**
 * What is inside the folder: up to four screens of the project that matter at
 * its stage, each with a one-line note from the project's own records. A
 * render the project has is shown as a picture.
 */
export function folderFiles(project: any): RoutedFile[] {
  const c = project?.context || {};
  const stage = stageOf(c.status);
  const tiers: any[] = project?.tiers || [];
  const rooms: any[] = c.rooms || [];
  const snags = (c.snagList || []).filter((s: any) => s?.status === 'open' || s?.status === 'in_progress').length;
  const docs: any[] = c.designDocuments || [];
  const render = docs.find((d) => isPicture(d?.url));
  const reports: any[] = c.weeklyReports || [];
  const out: RoutedFile[] = [];
  const push = (f: RoutedFile | null | false) => { if (f) out.push(f); };

  const renderFile = render ? { name: render.title || 'Latest render', meta: render.roomName || 'Render', image: render.url, route: 'drawing-tracker' } : null;
  switch (stage) {
    case 'lead':
      push({ name: 'Brief & site', meta: rooms.length ? plural(rooms.length, 'room') : 'Start here', route: 'leadiq' });
      push(tiers.length > 0 && { name: 'Pricing & options', meta: plural(tiers.length, 'option'), route: 'ops' });
      push({ name: 'Timeline', meta: 'Plan the dates', route: 'timeline' });
      break;
    case 'proposal':
      push({ name: 'Client proposal', meta: 'As the client sees it', route: 'client' });
      push({ name: 'Pricing & options', meta: tiers.length ? plural(tiers.length, 'option') : 'No option yet', route: 'ops' });
      push({ name: 'BOQ', meta: rooms.length ? plural(rooms.length, 'room') : 'Scope', route: 'boq-editor' });
      push(renderFile);
      break;
    case 'won':
      push({ name: 'Execution agreement', meta: c.executionSignoff?.status === 'signed' ? 'Signed' : 'To sign', route: 'execution-agreement' });
      push({ name: 'Payment schedule', meta: 'Milestones', route: 'payment-calc' });
      push({ name: 'Drawings', meta: docs.length ? plural(docs.length, 'file') : 'Drawing tracker', route: 'drawing-tracker' });
      push(renderFile);
      break;
    case 'execution':
      push({ name: 'Site control room', meta: 'Trade packages', route: 'site-ops' });
      push({ name: 'Quality & snags', meta: snags ? `${snags} open` : 'No open snag', route: 'site-quality' });
      push({ name: 'Payments', meta: 'Milestones', route: 'payment-calc' });
      push(renderFile || { name: 'Weekly reports', meta: reports.length ? `Week ${Math.max(...reports.map((r) => r.weekNumber || 0))}` : 'None yet', route: 'site-meetings' });
      break;
    case 'completed':
      push({ name: 'Handover docket', meta: c.handoverSignoff?.status === 'signed' ? 'Signed' : 'Closeout', route: 'handover-docket' });
      push({ name: 'Documents', meta: 'Everything issued', route: 'docs' });
      push(renderFile);
      break;
    case 'lost':
      push({ name: 'Brief & site', meta: 'As it was', route: 'leadiq' });
      push(tiers.length > 0 && { name: 'Last proposal', meta: plural(tiers.length, 'option'), route: 'client' });
      break;
  }
  return out.slice(0, 4);
}

/** The step on the folder's glass: the project's top action, as a one-click button. */
export interface FolderNext {
  label: string;
  route: string;
  tone: 'red' | 'gold' | 'brand';
  /** The tag on the folder's shoulder when the step blocks or is due. */
  flag: string | null;
}

export function folderNext(action: NextAction | null | undefined): FolderNext | null {
  if (!action) return null;
  const tone = action.priority === 'blocker' ? 'red' : action.priority === 'due' ? 'gold' : 'brand';
  return {
    label: action.ctaLabel || action.title,
    route: action.route,
    tone,
    flag: action.priority === 'suggested' ? null : action.title,
  };
}

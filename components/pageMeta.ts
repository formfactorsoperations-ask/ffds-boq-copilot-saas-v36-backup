import { NAV_CONFIG, ALWAYS_ON_BAND } from './navConfig';

/**
 * Single source of truth for page titles.
 *
 * Titles for routes that appear in NAV_CONFIG are derived from the nav label at
 * module load, so the page title and the thing you clicked can never drift apart.
 * Everything below is either a subtitle, or an entry for a route the nav does not
 * cover (studio-level pages, settings, report pages).
 *
 * A route with no entry here renders no title block. Adding a route without adding
 * it here is what scripts/check-page-headers.mjs fails on.
 */

export interface PageMeta {
  /** Overrides the nav label. Only set this when the nav label is genuinely wrong as a page title. */
  title?: string;
  /** One line, sentence case, no trailing period. Omit when the title says enough. */
  subtitle?: string;
  /** Studio-level pages sit outside a project and never show project vitals. */
  scope?: 'studio' | 'project';
}

/** Titles pulled from the nav so the two cannot diverge. */
const navTitles: Record<string, string> = {};
NAV_CONFIG.forEach(stage => {
  stage.items.forEach(item => { navTitles[item.route] = item.label; });
});
ALWAYS_ON_BAND.forEach(item => { navTitles[item.route] = item.label; });

const META: Record<string, PageMeta> = {
  // ---- Studio level -------------------------------------------------------
  home:                   { title: 'Home',              subtitle: 'Studio activity and what needs attention', scope: 'studio' },
  projects:               { title: 'Projects',          subtitle: 'Active executions and pipeline deals', scope: 'studio' },
  clients:                { title: 'Clients',           subtitle: 'Portfolio tracking and account values', scope: 'studio' },
  reports:                { title: 'Reports',           subtitle: 'Studio performance across projects', scope: 'studio' },
  bank:                   { title: 'Item Bank',         subtitle: 'Catalogue items, rates and packages', scope: 'studio' },
  templates:              { title: 'Templates',         subtitle: 'Reusable scopes and document templates', scope: 'studio' },
  'admin-templates-bank': { title: 'Templates & Bank',  subtitle: 'Studio catalogue and template library', scope: 'studio' },
  'studio-settings':      { title: 'Studio Settings',   subtitle: 'Branding, team, and defaults', scope: 'studio' },
  'communication-templates': { title: 'Communication Templates', subtitle: 'Global email and WhatsApp notification templates', scope: 'studio' },
  'ai-settings':          { title: 'AI Settings',       subtitle: 'Model behaviour and pricing strategy', scope: 'studio' },
  'saas-dashboard':       { title: 'Platform Admin',    subtitle: 'Tenants, usage and provisioning', scope: 'studio' },
  emails:                 { title: 'Email Drafts',      subtitle: 'Queued and sent client correspondence', scope: 'studio' },
  'data-privacy':         { title: 'Data Privacy',      subtitle: 'What is stored, who processes it, what leaves the studio', scope: 'studio' },
  support:                { title: 'Support Desk',      subtitle: 'System status and how to report a problem', scope: 'studio' },
  'terms-of-use':         { title: 'Terms of Use',      subtitle: 'How the studio expects this system to be used', scope: 'studio' },

  // ---- Project: stage 1 ---------------------------------------------------
  leadiq:                 { subtitle: 'Space parameters, locked scopes, and sales-to-site handoff' },
  'terms-docket':         { subtitle: 'Engagement terms and client acknowledgement' },

  // ---- Project: stage 2 ---------------------------------------------------
  'boq-editor':           { subtitle: 'Build and refine your scope room by room' },
  ops:                    { subtitle: 'Tier pricing, margins and what the client sees' },
  analytics:             { subtitle: 'Margin health, outliers and scope audit' },

  // ---- Project: stage 3 ---------------------------------------------------
  client:                 { subtitle: 'The proposal as the client receives it' },
  'revision-studio':      { title: 'Revisions', subtitle: 'Track scope changes and compare versions' },
  'client-boq-pack':      { title: 'Client BOQ Pack', subtitle: 'Printable scope pack for the client' },

  // ---- Project: stage 4 ---------------------------------------------------
  'execution-agreement':  { subtitle: 'Contract terms and signature status' },
  'payment-calc':         { title: 'Payment Schedule', subtitle: 'Milestones, billing status and collections' },
  'payment-schedule':     { title: 'Payment Schedule', subtitle: 'Milestones, billing status and collections' },
  onboarding:             { subtitle: 'What the client receives at kickoff' },
  'drawing-tracker':      { subtitle: 'Drawing issue status and revisions' },
  'design-gate':          { subtitle: 'Checks that must clear before execution' },

  // ---- Project: stage 5 ---------------------------------------------------
  'site-ops':             { subtitle: 'Site progress, trade packages and client updates' },
  materials:              { subtitle: 'Material selections, cost variations and purchase orders' },
  'scope-additions':      { subtitle: 'Work added after the contract was signed' },
  snaglist:               { title: 'Snag List', subtitle: 'Open defects and rectification status' },
  checklist:              { title: 'Quality Checklist', subtitle: 'Site quality checks by area' },

  // ---- Project: stage 6 ---------------------------------------------------
  'handover-docket':      { subtitle: 'Closeout documents and handover sign-off' },

  // ---- Project: always-on band -------------------------------------------
  'project-journey':      { subtitle: 'Every step in this project, and what is outstanding' },
  docs:                   { subtitle: 'Drawings, contracts and shared files' },
  'client-portal':        { title: 'Client Portal', subtitle: 'What the client sees, and what they still owe you' },
  timeline:               { subtitle: 'Programme dates and dependencies' },
  'comms-tracker':        { subtitle: 'Client conversations and follow-ups' },
  'record-decision':      { subtitle: 'Decisions taken, and who signed off' },
  history:                { subtitle: 'Change timeline and data trail' },
  'mom-action-tracker':   { title: 'Meeting Actions', subtitle: 'Actions captured from meeting notes' },
  'update-client-feed':   { title: 'Client Update', subtitle: 'Post an update to the client feed' },
  dashboard:              { title: 'Project Setup', subtitle: 'Configure scope before building the BOQ' },
};

/** Returns the meta for a route, with the title resolved from the nav where possible. */
export function getPageMeta(route: string): (PageMeta & { title: string }) | null {
  const entry = META[route];
  const title = entry?.title || navTitles[route];
  if (!title) return null;
  return { ...entry, title };
}

/** Every route this registry knows about — used by the header check script. */
export const KNOWN_ROUTES = Array.from(
  new Set([...Object.keys(META), ...Object.keys(navTitles)])
).sort();

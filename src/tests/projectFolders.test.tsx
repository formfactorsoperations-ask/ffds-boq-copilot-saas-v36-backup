/*
  Projects as glass folders (plan item 10; DESIGN.md "Projects as glass folders").

  Pins: the six stages and how a status folds into one, the Actual / Dummy tag,
  the files a folder holds at each stage and the screens they open, the next
  step on the glass, every action being one click, the stage tabs filtering the
  desk, and the amounts the owner asked to keep off this screen staying off.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { stageOf, kindOf, folderFiles, folderNext, FOLDER_STAGES, toneOf } from '../../lib/projectFolders';
import ProjectFolder from '../../components/projects/ProjectFolder';

vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: null, storage: null, functions: null, isFirebaseConfigured: () => true }));
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig();
  return { ...real, collection: () => ({}), collectionGroup: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
    getDoc: async () => ({ exists: () => false, data: () => undefined }), getDocs: async () => ({ docs: [], empty: true, size: 0 }), onSnapshot: () => () => {} };
});
const orgFlags = { playground: false };
vi.mock('../../contexts/OrgContext', () => ({
  useOrg: () => ({ orgData: { tenantId: 't1', team: [], playground: orgFlags.playground }, currentRole: 'Admin', updateOrgData: async () => {}, teamMembers: [] }),
}));

afterEach(cleanup);

const project = (id: string, status: string, extra: any = {}) => ({
  id, tenantId: 't1', lastModified: 1,
  context: { name: `Project ${id}`, clientName: `Client ${id}`, status, rooms: [{ id: 'k', name: 'Kitchen' }], isDummy: false, ...extra },
  tiers: [{ id: 't' }], activeTierId: null,
});

describe('stages', () => {
  it('folds every status into one of six stages, each with its own colour', () => {
    expect(['lead', 'draft', undefined, 'whatever'].map(stageOf)).toEqual(['lead', 'lead', 'lead', 'lead']);
    expect(['proposal_sent', 'negotiation'].map(stageOf)).toEqual(['proposal', 'proposal']);
    expect(stageOf('won')).toBe('won');
    expect(['execution', 'work_paused'].map(stageOf)).toEqual(['execution', 'execution']);
    expect(['completed', 'archived'].map(stageOf)).toEqual(['completed', 'completed']);
    expect(stageOf('lost')).toBe('lost');
    expect(FOLDER_STAGES.map((s) => s.label)).toEqual(['New lead', 'Proposal sent', 'Won', 'On site', 'Handed over', 'Lost']);
    expect(new Set(FOLDER_STAGES.map((s) => s.color)).size).toBe(6);
    expect(toneOf('won')).toBe('dark');
  });

  it('tags a project Actual, Dummy or Untagged from its own tag', () => {
    expect(kindOf({ context: { isDummy: false } })).toBe('actual');
    expect(kindOf({ context: { isDummy: true } })).toBe('dummy');
    expect(kindOf({ context: {} })).toBe('untagged');
  });
});

describe('what a folder holds', () => {
  it('holds the screens that matter at its stage, each opening its route', () => {
    expect(folderFiles(project('a', 'execution', { snagList: [{ status: 'open' }, { status: 'verified' }] })).map((f) => [f.name, f.route, f.meta]))
      .toEqual([
        ['Site control room', 'site-ops', 'Trade packages'],
        ['Quality & snags', 'site-quality', '1 open'],
        ['Payments', 'payment-calc', 'Milestones'],
        ['Weekly reports', 'site-meetings', 'None yet'],
      ]);
    expect(folderFiles(project('b', 'won', { executionSignoff: { status: 'signed' } }))[0]).toMatchObject({ name: 'Execution agreement', meta: 'Signed', route: 'execution-agreement' });
    expect(folderFiles(project('c', 'proposal_sent')).map((f) => f.route)).toEqual(['client', 'ops', 'boq-editor']);
  });

  it('shows a render the project has as a picture', () => {
    const files = folderFiles(project('d', 'execution', { designDocuments: [{ title: 'Living render v3', roomName: 'Living', url: 'https://x/r3.jpg' }] }));
    expect(files[3]).toMatchObject({ name: 'Living render v3', image: 'https://x/r3.jpg', route: 'drawing-tracker' });
  });

  it('puts the top action on the glass, red when it blocks and gold when it is due', () => {
    expect(folderNext(null)).toBeNull();
    expect(folderNext({ id: '1', title: 'Client query on the laminate', why: '', ctaLabel: 'Reply', route: 'comms-tracker', priority: 'blocker', roles: [] }))
      .toEqual({ label: 'Reply', route: 'comms-tracker', tone: 'red', flag: 'Client query on the laminate' });
    expect(folderNext({ id: '2', title: 'Payment 3', why: '', ctaLabel: 'Send reminder', route: 'payment-calc', priority: 'due', roles: [] })!.tone).toBe('gold');
    expect(folderNext({ id: '3', title: 'Plan the week', why: '', ctaLabel: 'Open timeline', route: 'timeline', priority: 'suggested', roles: [] }))
      .toMatchObject({ tone: 'brand', flag: null });
  });
});

describe('ProjectFolder: everything is one click', () => {
  const setup = () => {
    const onOpen = vi.fn();
    const onChangeStage = vi.fn();
    render(
      <ProjectFolder id="p1" name="Palacia 3BHK" meta="3 BHK · Thane" client="Mrs Jamnis" stage="execution" kind="dummy"
        files={[{ name: 'Quality & snags', meta: '2 open', route: 'site-quality' }]}
        next={{ label: 'Reply to client', route: 'comms-tracker', tone: 'red', flag: 'Laminate query' }}
        width={340} index={0} onOpen={onOpen} onChangeStage={onChangeStage} />,
    );
    return { onOpen, onChangeStage, folder: screen.getByTestId('project-folder-p1') };
  };

  it('shows the stage flag, the Dummy tag and the blocking flag', () => {
    const { folder } = setup();
    expect(folder.querySelector('.pf-cloth')?.textContent).toBe('On site');
    expect(within(folder).getByText('Dummy')).toBeTruthy();
    expect(within(folder).getByText('Laminate query')).toBeTruthy();
  });

  it('opens the project from the glass, and the next step at its screen', () => {
    const { folder, onOpen } = setup();
    fireEvent.click(folder.querySelector('.gf-hit')!);
    expect(onOpen).toHaveBeenLastCalledWith(undefined);
    fireEvent.click(within(folder).getByRole('button', { name: /Reply to client/ }));
    expect(onOpen).toHaveBeenLastCalledWith('comms-tracker');
  });

  it('··· lists the files, so a touch screen reaches them too, and the rest', () => {
    const { folder, onOpen, onChangeStage } = setup();
    fireEvent.click(within(folder).getByRole('button', { name: 'More for Palacia 3BHK' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Quality & snags/ }));
    expect(onOpen).toHaveBeenLastCalledWith('site-quality');
    fireEvent.click(within(folder).getByRole('button', { name: 'More for Palacia 3BHK' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change stage' }));
    expect(onChangeStage).toHaveBeenCalled();
  });
});

describe('the Projects desk', () => {
  const projects = [
    project('1', 'lead'), project('2', 'proposal_sent'), project('3', 'won'),
    project('4', 'execution'), project('5', 'execution', { isDummy: true }), project('6', 'lost'),
  ];
  const mount = async () => {
    const { default: ProjectListTab } = await import('../../components/ProjectListTab');
    const onOpenProject = vi.fn();
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<ProjectListTab projects={projects as any} activeProjectId={null} onOpenProject={onOpenProject}
        onCreateNew={() => {}} onDeleteProject={() => {}} onDuplicateProject={() => {}} />);
    });
    return { view: view!, onOpenProject };
  };
  const folders = (v: ReturnType<typeof render>) => v.container.querySelectorAll('[data-testid^="project-folder-"]').length;

  it('a stage tab shows only that stage, with its count', async () => {
    const { view } = await mount();
    const tabs = within(view.container.querySelector('.pf-dividers') as HTMLElement);
    expect(folders(view)).toBe(6);
    fireEvent.click(tabs.getByRole('button', { name: /On site\s*2/ }));
    expect(folders(view)).toBe(2);
    fireEvent.click(tabs.getByRole('button', { name: /Lost\s*1/ }));
    expect(folders(view)).toBe(1);
  });

  it('Actual and Dummy live in the Filters menu', async () => {
    const { view } = await mount();
    fireEvent.click(within(view.container).getByRole('button', { name: /Filters/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Dummy/ }));
    expect(folders(view)).toBe(1);
  });

  it('keeps amounts off the screen', async () => {
    const { view } = await mount();
    expect(view.queryByText(/Book on screen/i)).toBeNull();
    expect(view.container.textContent).not.toMatch(/₹/);
  });

  it('a file opens the project at that screen', async () => {
    const { view, onOpenProject } = await mount();
    const folder = view.getByTestId('project-folder-4');
    fireEvent.click(within(folder).getByRole('button', { name: /More for/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Site control room/ }));
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: '4' }), 'site-ops');
  });
});

describe('the BOQ tag (BOQ Playground PR T)', () => {
  const line = { id: 'l', bankId: 'b', qty: 1 };
  const projects = [
    project('pg', 'proposal_sent'),
    project('cl', 'lead'),
    project('no', 'lead'),
  ];
  projects[0].tiers = [{ id: 't', boq: [line], timestamp: 1 }, { id: 'u', boq: [line], timestamp: 2, boqFormat: 'playground' }] as any;
  projects[1].tiers = [{ id: 't', boq: [line], timestamp: 1 }] as any;
  projects[2].tiers = [{ id: 't', boq: [] }] as any;
  const mount = async () => {
    const { default: ProjectListTab } = await import('../../components/ProjectListTab');
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<ProjectListTab projects={projects as any} activeProjectId={null} onOpenProject={() => {}}
        onCreateNew={() => {}} onDeleteProject={() => {}} onDuplicateProject={() => {}} />);
    });
    return view!;
  };
  afterEach(() => { orgFlags.playground = false; });

  it('sits on each folder’s shoulder beside Actual / Dummy while the Playground is on', async () => {
    orgFlags.playground = true;
    const view = await mount();
    const tag = (id: string) => view.container.querySelector(`[data-testid="project-folder-${id}"] .pf-boq`)?.textContent;
    expect(tag('pg')).toBe('Playground BOQ');
    expect(tag('cl')).toBe('Classic BOQ');
    expect(tag('no')).toBe('No BOQ yet');
  });

  it('the Filters menu shows one kind of BOQ, with counts', async () => {
    orgFlags.playground = true;
    const view = await mount();
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const classic = screen.getByRole('menuitem', { name: /^Classic/ });
    expect(classic.textContent).toContain('1');
    fireEvent.click(classic);
    expect(view.container.querySelectorAll('[data-testid^="project-folder-"]').length).toBe(1);
    expect(screen.getByRole('button', { name: /^Filters · 1/ })).toBeTruthy();
  });

  it('is not there with the Playground off', async () => {
    const view = await mount();
    expect(view.container.querySelector('.pf-boq')).toBeNull();
  });
});

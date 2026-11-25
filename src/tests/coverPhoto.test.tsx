/*
  Cover photos (DESIGN.md "Projects: journey, needs you, one list"; Phase 2).

  Pins: Google Drive file links become images and folders do not; the order a
  project's photo is chosen in (the cover set for it, the latest render the
  client approved, the latest render, nothing); a cover picked from a render
  goes when the render goes; the Projects screen tries the next photo when one
  fails to load; "Set as cover" under Drawings → Renders and "Upload cover" in
  the project's Details write the cover.
*/
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: { currentUser: { email: 'mayuri@studio.in' } }, storage: {}, functions: null, isFirebaseConfigured: () => true }));
const upload = vi.fn(async () => ({ url: 'https://storage.test/projects/p1/cover/1.jpg', storagePath: 'projects/p1/cover/1.jpg' }));
const removeCover = vi.fn(async () => {});
vi.mock('../../services/coverStorage', async (orig) => {
  const real: any = await orig();
  return { ...real, uploadCover: (...a: any[]) => (upload as any)(...a), removeCover: (...a: any[]) => (removeCover as any)(...a) };
});

import { driveFileId, driveImageUrl, coverOf, coverCandidates, canBeCover, addedAtOf } from '../../lib/coverPhoto';
import { coverFileProblem } from '../../services/coverStorage';
import { ProjectPhoto } from '../../components/projects/journey/parts';
import DesignDocumentsManager from '../../components/ops/DesignDocumentsManager';
import { CoverPhotoPanel } from '../../components/ProjectContextTier';

afterEach(() => { cleanup(); upload.mockClear(); removeCover.mockClear(); });

const ID = '1AbCdEfGhIjKlMnOpQrStUvWx';
const thumb = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;

describe('Google Drive links as images', () => {
  it('reads the file id from every kind of Drive file link', () => {
    expect(driveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(driveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(driveFileId(`https://drive.google.com/uc?export=download&id=${ID}`)).toBe(ID);
    expect(driveFileId(`https://docs.google.com/presentation/d/${ID}/edit`)).toBe(ID);
  });

  it('a folder, another site or nothing is not a Drive file', () => {
    expect(driveFileId(`https://drive.google.com/drive/folders/${ID}`)).toBeNull();
    expect(driveFileId('https://example.com/file/d/abc/view')).toBeNull();
    expect(driveFileId('')).toBeNull();
  });

  it('turns a Drive file into its thumbnail and leaves other links as they are', () => {
    expect(driveImageUrl(`https://drive.google.com/file/d/${ID}/view`)).toBe(thumb(ID));
    expect(driveImageUrl(`https://drive.google.com/file/d/${ID}/view`, 600)).toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w600`);
    expect(driveImageUrl('https://cdn.test/r.jpg')).toBe('https://cdn.test/r.jpg');
    expect(driveImageUrl('')).toBeNull();
  });
});

describe('which photo a project shows', () => {
  const docs = [
    { id: 'old', roomName: 'Living', title: 'Old', url: 'https://cdn.test/old.jpg', addedAt: '2026-10-01T00:00:00Z' },
    { id: 'drive', roomName: 'Kitchen', title: 'Kitchen', url: 'https://drive.google.com/drive/folders/x', thumbnailUrl: `https://drive.google.com/file/d/${ID}/view`, addedAt: '2026-11-20T00:00:00Z' },
    { id: 'gfc', roomName: 'All', title: 'GFC', url: 'https://cdn.test/gfc.png', docType: 'gfc_drawing', addedAt: '2026-11-24T00:00:00Z' },
    { id: 'pdf', roomName: 'All', title: 'Sheet', url: 'https://cdn.test/sheet.pdf', addedAt: '2026-11-25T00:00:00Z' },
  ] as any[];
  const approved = { id: 'd1', date: '2026-11-10', title: 'Living final', status: 'confirmed', decisionNature: 'design', photoUrl: 'https://cdn.test/approved.jpg', clientConfirmedAt: '2026-11-12T00:00:00Z' };

  it('the latest render with a picture, by when it was added (an ISO date), Drive links turned into images', () => {
    expect(addedAtOf(docs[1])).toBe(Date.parse('2026-11-20T00:00:00Z'));
    expect(coverOf({ designDocuments: docs })).toEqual({ url: thumb(ID), source: 'render', docId: 'drive' });
    /* A drawing and a PDF are not renders with a picture. */
    expect(canBeCover(docs[2])).toBe(false);
    expect(canBeCover(docs[3])).toBe(false);
  });

  it('a render the client approved comes before the latest render; a site decision does not count', () => {
    const site = { ...approved, id: 'd2', decisionNature: 'site', photoUrl: 'https://cdn.test/site.jpg', clientConfirmedAt: '2026-11-24T00:00:00Z' };
    const pending = { ...approved, id: 'd3', status: 'pending', photoUrl: 'https://cdn.test/pending.jpg' };
    expect(coverOf({ designDocuments: docs, projectDecisions: [site, pending, approved] as any })).toMatchObject({ url: 'https://cdn.test/approved.jpg', source: 'approved' });
  });

  it('the cover set for the project comes first', () => {
    const ctx = { designDocuments: docs, projectDecisions: [approved] as any, coverPhoto: { url: 'https://storage.test/cover.jpg', source: 'upload' as const, setAt: 1 } };
    expect(coverCandidates(ctx).map((c) => c.source)).toEqual(['cover', 'approved', 'render', 'render']);
  });

  it('a cover picked from a render goes when the render goes', () => {
    const cover = { url: 'https://cdn.test/old.jpg', source: 'render' as const, docId: 'old', setAt: 1 };
    expect(coverOf({ designDocuments: docs, coverPhoto: cover })).toMatchObject({ source: 'cover', docId: 'old' });
    expect(coverOf({ designDocuments: docs.filter((d) => d.id !== 'old'), coverPhoto: cover }).source).toBe('render');
  });

  it('nothing at all is the "No render yet" tile', () => {
    expect(coverOf({})).toEqual({ url: null, source: 'none' });
  });

  it('the screen tries the next photo when one fails to load, then the tile', () => {
    const { container } = render(<ProjectPhoto row={{ stage: 'won', photo: 'https://a.test/1.jpg', photos: ['https://a.test/1.jpg', 'https://a.test/2.jpg'] }} />);
    const img = () => container.querySelector('img');
    expect(img()?.getAttribute('src')).toBe('https://a.test/1.jpg');
    fireEvent.error(img()!);
    expect(img()?.getAttribute('src')).toBe('https://a.test/2.jpg');
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(container.textContent).toContain('No render yet');
  });
});

describe('setting the cover', () => {
  it('"Set as cover" on a render makes it the cover, and a second click takes it off', () => {
    let latest: any;
    const Host = () => {
      const [ctx, setCtx] = useState<any>({ rooms: [], designDocuments: [{ id: 'r1', roomName: 'Living', title: 'Living v3', url: 'https://cdn.test/living.jpg', addedAt: '2026-11-20T00:00:00Z' }] });
      latest = ctx;
      return <DesignDocumentsManager projectContext={ctx} setProjectContext={setCtx} embedded />;
    };
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Set as cover' }));
    expect(latest.coverPhoto).toMatchObject({ url: 'https://cdn.test/living.jpg', source: 'render', docId: 'r1', setBy: 'mayuri@studio.in' });
    expect(screen.getAllByText('Cover').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Cover ✓/ }));
    expect(latest.coverPhoto).toBeNull();
  });

  it('refuses a file that is not a photo, or too large, before sending it', () => {
    expect(coverFileProblem({ type: 'application/pdf', size: 10 })).toMatch(/JPG, PNG/);
    expect(coverFileProblem({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/over 10 MB/);
    expect(coverFileProblem({ type: 'image/png', size: 2000 })).toBeNull();
  });

  it('"Upload cover" in Details puts the photo in Storage and makes it the cover; Remove cover takes it off', async () => {
    let latest: any;
    const Host = () => {
      const [ctx, setCtx] = useState<any>({ name: 'P1' });
      latest = ctx;
      return <CoverPhotoPanel projectContext={ctx} projectId="p1" setProjectContext={setCtx} />;
    };
    render(<Host />);
    const file = new File(['x'], 'front.jpg', { type: 'image/jpeg' });
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a cover photo'), { target: { files: [file] } }); });
    await waitFor(() => expect(latest.coverPhoto?.source).toBe('upload'));
    expect(upload).toHaveBeenCalledWith('p1', file, null);
    expect(latest.coverPhoto).toMatchObject({ url: 'https://storage.test/projects/p1/cover/1.jpg', storagePath: 'projects/p1/cover/1.jpg', setBy: 'mayuri@studio.in' });
    expect(screen.getByRole('region', { name: 'Cover photo' }).querySelector('img')?.getAttribute('src')).toBe('https://storage.test/projects/p1/cover/1.jpg');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove cover' })); });
    expect(removeCover).toHaveBeenCalledWith('projects/p1/cover/1.jpg');
    expect(latest.coverPhoto).toBeNull();
  });

  it('a PDF chosen as a cover is refused with a reason, and nothing is uploaded', async () => {
    const Host = () => { const [ctx, setCtx] = useState<any>({}); return <CoverPhotoPanel projectContext={ctx} projectId="p1" setProjectContext={setCtx} />; };
    render(<Host />);
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a cover photo'), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } }); });
    expect(screen.getByRole('alert').textContent).toMatch(/JPG, PNG/);
    expect(upload).not.toHaveBeenCalled();
  });
});

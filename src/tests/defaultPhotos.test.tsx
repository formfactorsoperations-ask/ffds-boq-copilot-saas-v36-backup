/*
  Default project pictures (owner, 25 Nov 2026; lib/defaultPhotos).

  Pins: a project with no cover and no render shows the studio's default
  photo, else an interior photo for its type, picked steadily by its id; a
  default picture carries "No render yet"; a project's own photo always comes
  first; and the studio's photo is uploaded in Studio settings.
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

vi.mock('../../services/firebaseClient', () => ({ db: {}, auth: { currentUser: { email: 'owner@studio.in' } }, storage: {}, functions: null, isFirebaseConfigured: () => true }));
const uploadStudio = vi.fn(async () => ({ url: 'https://storage.test/studios/s1/projectPhoto/1.jpg', storagePath: 'studios/s1/projectPhoto/1.jpg' }));
vi.mock('../../services/coverStorage', async (orig) => {
  const real: any = await orig();
  return { ...real, uploadStudioPhoto: (...a: any[]) => (uploadStudio as any)(...a) };
});

import { photoKindOf, typePhotoOf, KIND_PHOTOS } from '../../lib/defaultPhotos';
import { coverCandidates, coverOf, isDefaultSource } from '../../lib/coverPhoto';
import { ProjectPhoto } from '../../components/projects/journey/parts';
import DefaultProjectPhotoSetting from '../../components/studio/DefaultProjectPhotoSetting';

afterEach(() => { cleanup(); uploadStudio.mockClear(); });

const p = (id: string, context: any) => ({ id, context });

describe('a photo by project type', () => {
  it('reads the kind of place from the configuration and the name', () => {
    expect(photoKindOf(p('a', { config: '2-BHK' }))).toBe('apartment');
    expect(photoKindOf(p('a', { config: '1+1 BHK' }))).toBe('apartment');
    expect(photoKindOf(p('a', { config: 'Bungalow', name: 'Pali Bungalow' }))).toBe('house');
    expect(photoKindOf(p('a', { name: 'Seaside Villa' }))).toBe('house');
    expect(photoKindOf(p('a', { config: 'Retail', name: 'El Dorado Shop' }))).toBe('commercial');
    expect(photoKindOf(p('a', { config: 'Commercial', name: 'Malad Co-op Bank Branch' }))).toBe('commercial');
    expect(photoKindOf(p('a', { config: 'Wardrobes', name: 'Splendora Wardrobes' }))).toBe('joinery');
    /* A flat whose name mentions its kitchen is still a flat. */
    expect(photoKindOf(p('a', { config: '3-BHK', name: 'Kitchen and living, 3BHK' }))).toBe('apartment');
    expect(photoKindOf(p('a', {}))).toBe('apartment');
  });

  it('picks the same photo for the same project, from that kind\'s photos', () => {
    const one = typePhotoOf(p('proj-123', { config: 'Bungalow' }));
    expect(typePhotoOf(p('proj-123', { config: 'Bungalow' }))).toBe(one);
    expect(KIND_PHOTOS.house.some((id) => one.includes(id))).toBe(true);
    const many = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => typePhotoOf(p(id, { config: '2-BHK' }))));
    expect(many.size).toBeGreaterThan(1);
  });
});

describe('where a default picture comes in', () => {
  const project = p('p1', { config: '2-BHK' });

  it('after the project\'s own photos: the studio\'s, then the one by type', () => {
    const ctx = { designDocuments: [{ id: 'r', roomName: 'Living', title: 'R', url: 'https://x/r.jpg', addedAt: '2026-11-20' }] } as any;
    expect(coverCandidates(ctx, 900, { studioPhoto: 'https://studio.test/d.jpg', project }).map((c) => c.source)).toEqual(['render', 'studio', 'type']);
    expect(coverOf({}, 900, { studioPhoto: 'https://studio.test/d.jpg', project })).toMatchObject({ url: 'https://studio.test/d.jpg', source: 'studio' });
    expect(coverOf({}, 900, { project }).source).toBe('type');
    expect(coverOf({}, 900).source).toBe('none');
    expect(['studio', 'type'].every((s) => isDefaultSource(s as any))).toBe(true);
    expect(isDefaultSource('render')).toBe(false);
  });

  it('says "No render yet" on a default picture, and nothing on the project\'s own', () => {
    const own = render(<ProjectPhoto row={{ stage: 'won', photo: 'https://x/r.jpg', photos: ['https://x/r.jpg'], defaultPhotos: [] }} />);
    expect(own.container.textContent).not.toContain('No render yet');
    cleanup();
    const def = render(<ProjectPhoto row={{ stage: 'won', photo: 'https://d/1.jpg', photos: ['https://d/1.jpg'], defaultPhotos: ['https://d/1.jpg'] }} />);
    expect(def.container.textContent).toContain('No render yet');
    cleanup();
    const row = render(<ProjectPhoto row={{ stage: 'won', photo: 'https://d/1.jpg', photos: ['https://d/1.jpg'], defaultPhotos: ['https://d/1.jpg'] }} label={false} mark="icon" />);
    expect(row.getByLabelText('No render yet')).toBeTruthy();
  });

  it('a project\'s own photo that fails to load gives way to the default, which is then marked', () => {
    const { container } = render(<ProjectPhoto row={{ stage: 'won', photo: 'https://x/gone.jpg', photos: ['https://x/gone.jpg', 'https://d/1.jpg'], defaultPhotos: ['https://d/1.jpg'] }} />);
    expect(container.textContent).not.toContain('No render yet');
    fireEvent.error(container.querySelector('img')!);
    expect(container.textContent).toContain('No render yet');
  });
});

describe('the studio\'s default photo in Studio settings', () => {
  it('uploads a photo into the draft, and goes back to photos by type', async () => {
    const onChange = vi.fn();
    const view = render(<DefaultProjectPhotoSetting tenantId="s1" value={null} saved={null} onChange={onChange} />);
    expect(view.container.textContent).toContain('A photo by project type');
    const file = new File(['x'], 'studio.jpg', { type: 'image/jpeg' });
    await act(async () => { fireEvent.change(screen.getByLabelText("Choose the studio's default project photo"), { target: { files: [file] } }); });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(uploadStudio).toHaveBeenCalledWith('s1', file);
    expect(onChange.mock.calls[0][0]).toMatchObject({ url: 'https://storage.test/studios/s1/projectPhoto/1.jpg', storagePath: 'studios/s1/projectPhoto/1.jpg', setBy: 'owner@studio.in' });
    cleanup();
    const set = vi.fn();
    render(<DefaultProjectPhotoSetting tenantId="s1" value={{ url: 'https://s/1.jpg', setAt: 1 }} saved={{ url: 'https://s/1.jpg', setAt: 1 }} onChange={set} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use photos by type' }));
    expect(set).toHaveBeenCalledWith(null);
  });

  it('refuses a file that is not a photo', async () => {
    const onChange = vi.fn();
    render(<DefaultProjectPhotoSetting tenantId="s1" value={null} saved={null} onChange={onChange} />);
    await act(async () => { fireEvent.change(screen.getByLabelText("Choose the studio's default project photo"), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } }); });
    expect(screen.getByRole('alert').textContent).toMatch(/JPG, PNG/);
    expect(uploadStudio).not.toHaveBeenCalled();
  });
});

/*
  The maquettes behind each conversation (owner, 27 Nov 2026: 3D shapes
  related to the conversation and to interior and architecture practice).
  Built without a renderer: every conversation has its own model, its pieces
  assemble in order, its motion runs, and it uses the palette only.
*/
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONVERSATIONS } from '../../lib/projectConversations';
import { buildModel, disposeModel, PALETTE, TINT } from '../../components/projectConversations/maquette';

const ALLOWED = new Set<number>([...Object.values(PALETTE), 0xffffff]);

describe('the conversation maquettes', () => {
  it('gives every conversation a model of its own, with pieces that assemble in order', () => {
    const counts = new Set<number>();
    for (const c of CONVERSATIONS) {
      const m = buildModel(c.id);
      expect(m.parts.length, c.id).toBeGreaterThanOrEqual(3);
      for (const p of m.parts) expect(p.parent).toBe(m.group);
      let meshes = 0;
      m.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes += 1; });
      counts.add(meshes);
      disposeModel(m);
    }
    expect(counts.size).toBeGreaterThan(5); // the models really differ
  });

  it('runs each model\'s own motion without error and keeps it in place', () => {
    for (const c of CONVERSATIONS) {
      const m = buildModel(c.id);
      for (const t of [0, 0.7, 3.3, 11.9]) m.tick(t);
      const box = new THREE.Box3().setFromObject(m.group);
      expect(box.isEmpty(), c.id).toBe(false);
      expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z), c.id).toBeLessThan(5);
      disposeModel(m);
    }
  });

  it('uses the palette only: slate card, brand lines, emerald, amber and rose', () => {
    for (const c of CONVERSATIONS) {
      const m = buildModel(c.id);
      m.tick(2);
      m.group.traverse((o) => {
        const mat = (o as any).material;
        if (mat?.color) expect(ALLOWED.has(mat.color.getHex()), `${c.id}: #${mat.color.getHexString()}`).toBe(true);
      });
      expect(ALLOWED.has(TINT[c.id])).toBe(true);
      disposeModel(m);
    }
  });
});

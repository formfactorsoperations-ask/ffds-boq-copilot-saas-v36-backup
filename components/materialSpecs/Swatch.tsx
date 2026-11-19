import React from 'react';
import { Layers, Columns2, SwatchBook, Zap } from 'lucide-react';
import type { Material } from '../../lib/materialSpecs';

/*
  A material's swatch (the approved mockup's): the finish or stone drawn as it
  is on the plan, or, for materials with no colour of their own, the family's
  icon on the brand tint. The patterns come from pieceArt's ArtDefs, mounted
  once on the page.
*/
const FAMILY_ICON: Record<string, React.ElementType> = {
  ply: Layers, inner: Layers, ceil: Layers, top: Layers, hw: Columns2, handle: Columns2, glass: Columns2, paint: SwatchBook, elec: Zap,
};

export default function Swatch({ mat, className = 'w-6 h-6 rounded-full' }: { mat: Pick<Material, 'fam' | 'swatch'> | null | undefined; className?: string }) {
  if (mat?.swatch) {
    return (
      <svg viewBox="0 0 3 3" className={`${className} border border-slate-300 shrink-0`} aria-hidden focusable="false">
        <rect width="3" height="3" fill={`url(#${mat.swatch})`} />
      </svg>
    );
  }
  const Icon = FAMILY_ICON[mat?.fam || ''] || Layers;
  return (
    <span className={`${className} shrink-0 grid place-items-center bg-[#3D52A0]/10 text-[#3D52A0]`} aria-hidden>
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

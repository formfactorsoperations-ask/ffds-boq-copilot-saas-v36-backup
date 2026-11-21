import type React from 'react';
import {
  Hammer, Zap, BrickWall, Package, ChefHat, PaintRoller, LampCeiling, Droplets, Flower2, Truck, AirVent,
  Grid3x3, Lightbulb, Armchair, Frame, PanelsTopLeft, Blinds, HardHat, Bath,
} from '@/lib/lucide-shim';

/**
 * An icon for a trade, a category or a line, read from its name. Pricing & Tiers
 * uses it for trades; the BOQ Playground for a line that is not drawn on the
 * plan (civil work, services), so tiling, plumbing and demolition each read as
 * what they are in a room's list.
 */
export function tradeIcon(name: string): React.ComponentType<any> {
  const n = (name || '').toLowerCase();
  if (/kitchen/.test(n)) return ChefHat;
  if (/ceiling/.test(n)) return LampCeiling;
  if (/paint/.test(n)) return PaintRoller;
  if (/light/.test(n)) return Lightbulb;
  if (/electric/.test(n)) return Zap;
  if (/plumb|sanitary/.test(n)) return Droplets;
  if (/bath/.test(n)) return Bath;
  if (/hvac|air/.test(n)) return AirVent;
  if (/til|floor/.test(n)) return Grid3x3;
  if (/demolition|site|debris/.test(n)) return /site|debris/.test(n) ? Truck : HardHat;
  if (/civil|masonry|plaster|stone|marble|granite|waterproof/.test(n)) return BrickWall;
  if (/glass|mirror/.test(n)) return PanelsTopLeft;
  if (/decor|art/.test(n)) return Flower2;
  if (/blind|curtain|furnish/.test(n)) return Blinds;
  if (/furniture|loose|sofa/.test(n)) return Armchair;
  if (/panel|tv/.test(n)) return Frame;
  if (/carpentry|wood|wardrobe|joinery|modular/.test(n)) return Hammer;
  return Package;
}

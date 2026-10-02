# TASK: Implement "BOQ Copilot Studio Workspace" in FFDS Studio OS

You are an expert React 19 + TypeScript + Tailwind CSS senior software engineer implementing a major spatial feature in FFDS Studio OS (an interior design SaaS for residential/commercial projects in India).

---

## 1. Context & Business Need
We are adding an intuitive, interactive 3-column "BOQ Copilot Studio Workspace" that allows interior designers and ops managers to visually plan spaces on a 2D architectural schematic floorplan and have it automatically generate and sync with the project's real BOQ (Bill of Quantities) in INR.

The user has reviewed and finalized the exact layout and interaction design shown in the concept prototype at `/public/mockup-cad-playground.html`.

---

## 2. Non-Negotiable Architectural Rules
1. **ZERO CAD DEPENDENCIES**: Do not install Three.js, Canvas libraries, Konva, Fabric.js, or heavy CAD packages. The entire floorplan is rendered with lightweight, accessible SVG elements and standard Tailwind CSS, ensuring 60 FPS performance and instant load times.
2. **NON-DISRUPTIVE COEXISTENCE (Twin-Lens Pattern)**: The existing BOQ views (tables, cards, mindmap, PDF exports, and Firestore sync) must remain 100% operational. The new workspace mounts via a view switcher (`[ Standard Table | 📐 Studio Workspace ]`) and reads/writes to the exact same canonical `project.tiers[activeTierId].items: BOQItem[]` array.
3. **GROUND TRUTH & PERSISTENCE**:
   - Currency is Indian Rupee (INR formatted via `formatCurrency` or `formatINR` from `@/lib/utils.ts`).
   - Project totals MUST read through `@/lib/financialsUtils.ts`. Do not calculate GST or margin manually.
   - Updates must be immutable: pass updated project state to `db.saveProject(...)` via `@/services/dbService.ts`.
4. **DESIGN SYSTEM (FFDS Surface Agreement)**:
   - Font: Plus Jakarta Sans for UI, Playfair Display reserved only for page titles.
   - Palette: Porcelain background (`bg-slate-50`), crisp white cards (`bg-white`), borders (`border-slate-200`), dark text (`text-slate-900`), and indigo accent (`#4f46e5`, `bg-indigo-600`, `text-indigo-600`).
   - Generous spacing: `rounded-2xl`, `shadow-card`, clean icons from `lucide-react`.

---

## 3. Data Schema Extension (`types.ts`)
Add optional, backward-compatible fields without breaking existing types:

```typescript
// Optional spatial metadata attached to standard BOQItem
export interface BOQItemSpatialMeta {
  roomId: string;             // e.g. "living", "bedroom", "kitchen", "study", "bath"
  placedCode?: string;        // Architectural code: "FF-001", "JW-002", "EL-001"
  svgX?: number;              // Position X inside room SVG coordinates
  svgY?: number;              // Position Y inside room SVG coordinates
  isSurfaceLinked?: boolean;  // True if quantity is bound to room floor/wall geometry
  linkedSurfaceType?: 'floor_tile' | 'wall_paint' | 'ceiling_cove' | 'skirting';
  wastageMultiplier?: number; // e.g. 1.07 (+7% wastage for vitrified tiles)
}

// Optional architectural room layout on ProjectContext
export interface ProjectRoomLayout {
  id: string;                 // "living", "bedroom", "kitchen", "study", "bath"
  name: string;               // Display title e.g. "Living & dining"
  code: string;               // "R01", "R02", etc.
  widthFt: number;            // e.g. 15.75 (15'-9")
  heightFt: number;           // e.g. 13.75 (13'-9")
  carpetAreaSqft: number;     // e.g. 217 sq ft
  carpetAreaM2: number;       // e.g. 20.16 m²
  ceilingHeightFt: number;    // e.g. 10.0 ft
  openingsDeductionSqft?: number; // Doors & window deduction (default: 42 sq ft)
}

// Attach to BOQItem interface:
// export interface BOQItem {
//   ... existing fields unchanged ...
//   spatialMeta?: BOQItemSpatialMeta;
// }

// Attach to ProjectContext interface:
// export interface ProjectContext {
//   ... existing fields unchanged ...
//   roomLayouts?: ProjectRoomLayout[];
// }
```

---

## 4. Technical Specifications & UI Layout (3 Columns)

### Column 1: Left Sidebar — Item Library & Room Assembly (Width: 320px)
- **Search Input**: Real-time filter across item catalog.
- **Category Pills**: `All`, `Objects`, `Finishes`.
- **Item Cards** (Draggable and Click-to-Add):
  1. **3–seat sofa** (₹42,000 / nos) • 7'-0" W × 3'-0" D • Fabric Upholstery
  2. **Lounge chair** (₹14,500 / nos) • 2'-8" W × 2'-8" D • Teak Legs
  3. **Queen bed** (₹38,000 / nos) • 5'-0" W × 6'-6" L • Hydraulic Lift
  4. **Wardrobe** (₹1,850 / sq ft) • Floor-to-ceiling • Soft-close hinges
  5. **Vitrified tile flooring** (₹125 / sq ft) • Auto-scales to room carpet area + 7% wastage
  6. **Royale wall emulsion** (₹38 / sq ft) • Auto-scales to net wall plaster area
  7. **COB LED downlight 9W** (₹1,250 / nos) • Complete wiring & fitting
- **Room Assembly Card** (Bottom):
  - Card title: "Flooring + paint + downlights"
  - Button: `+ Apply room package` (Applies vitrified tile with 7% wastage, 3-coat wall paint, and 4 downlights to the active room in one click).

### Column 2: Center — Architectural Schematic Floorplan Canvas (Flex-1)
- **Top Toolbar**:
  - Floor badge: "Ground floor"
  - Undo / Redo controls
  - Room Switcher Tabs: `Living & dining`, `Bedroom`, `Kitchen`, `Study`, `Bath`
  - Dimensions checkbox toggle: Shows/hides CAD dimension extension lines and slash ticks.
- **Interactive SVG Viewport** (820px × 560px canvas):
  - Default layout with 5 spatial room boundaries:
    * **Living & dining**: 15'-9" × 13'-9" (217 sq ft / 20.16 m²)
    * **Bedroom**: 11'-10" × 13'-9" (163 sq ft / 15.12 m²)
    * **Kitchen**: 9'-2" × 9'-2" (96 sq ft / 8.96 m²)
    * **Study**: 9'-2" × 8'-6" (84 sq ft / 7.84 m²)
    * **Bath**: 9'-2" × 7'-6" (72 sq ft / 6.72 m²)
  - Click on any room zone highlights it with an indigo tint and selects it across both sidebars.
  - Drag-and-drop target: Dropping an item or finish onto a room adds it to that specific room's BOQ.
  - Placed item symbols: Distinct SVG architectural representations with identification tags (`FF-001` sofa, `FF-002` chair, `FF-003` bed, `JW-001` wardrobe, `EL-001` light).
  - Floating Inspector Bubble: Clicking any placed item opens a floating bubble allowing quantity increments (`+` / `-`), rate breakdown, and removal.
- **Canvas Bottom Bar**:
  - Status chip: "Sample plan • Dimensions in ft & sq ft | Snap 0.5 ft • Schematic | Surface-linked quantity | Placed item".

### Column 3: Right Sidebar — Live BOQ Panel (Width: 360px)
- **Scope Toggle**: `Selected room` vs `All rooms`.
- **Active Room Info Card**:
  - Room Title (e.g. "Living & dining") and Code ("R01").
  - Area display: "217 sq ft (20.16 m²)".
  - Action link: "Edit dimensions" (Opens modal to adjust room width/height in feet with live recalculation of carpet sq ft and dependent finishes).
- **Dynamic BOQ Line Items**:
  - Grouped by room, showing title, unit rate, count/sqft, total INR, and status badges (`↳ Placed item • 1 count`, `↳ Floor area + 7% wastage`).
  - Inline delete and edit handlers.
- **Room Subtotal & Tax Notice**:
  - Live subtotal formatted in INR.
  - Note: "Illustrative rates • excluding tax (GST 18% applied at docket)".

### Bottom Persistent Bar:
- Left: Live activity toast with glowing emerald pulse (e.g. "Package applied: flooring, wall paint and 4 downlights").
- Right: Master "PROJECT ESTIMATE" in bold INR font.

---

## 5. Mathematical Engine (Imperial & Metric Calculations)
1. **Carpet Area**:
   $$\text{Carpet Area (sq ft)} = W_{\text{ft}} \times H_{\text{ft}}$$
2. **Flooring with Wastage**:
   $$\text{Vitrified Tile Quantity (sq ft)} = \text{Carpet Area} \times 1.07 \quad (\text{+7\% tile cutting wastage})$$
3. **Wall Paint Plaster Net Area**:
   $$\text{Gross Wall Area} = 2 \times (W_{\text{ft}} + H_{\text{ft}}) \times \text{Ceiling Height (10 ft)}$$
   $$\text{Net Paint Area} = \text{Gross Wall Area} - \text{Openings (42 sq ft standard door/window)}$$
4. **False Ceiling & Cove**:
   $$\text{Ceiling Area} = \text{Carpet Area}, \quad \text{Perimeter LED Cove (rft)} = 2 \times (W_{\text{ft}} + H_{\text{ft}}) - 4$$

---

## 6. Implementation Steps
1. Extend `types.ts` with optional `spatialMeta?: BOQItemSpatialMeta` on `BOQItem` and `roomLayouts?: ProjectRoomLayout[]` on `ProjectContext`.
2. Build modular components inside `components/BOQCopilot/`:
   - `BOQCopilotWorkspace.tsx`: 3-column orchestrator component.
   - `ItemLibrarySidebar.tsx`: Left column with search, category pills, items, and room assembly package triggers.
   - `FloorplanCanvas.tsx`: Center column lightweight SVG canvas with dynamic room boundaries, symbols, dimension ticks, and inspector bubble.
   - `LiveBOQPanel.tsx`: Right column reactive BOQ line items, room dimension inspector, and room subtotal.
   - `RoomDimensionModal.tsx`: Modal for modifying room length and width in feet/inches with automatic recalculation.
3. Wire the custom state hook `hooks/useBOQCopilotState.ts` to manage item placement, math conversions (sq ft, wastage, wall plaster deductions), and bi-directional synchronization with `project.tiers[activeTierId].items`.
4. Add the view mode switcher inside the main BOQ Editor (`components/BOQEditor.tsx`) so users can switch seamlessly between `Standard Table` and `📐 Studio Workspace`.
5. Run `compile_applet` to ensure zero compilation or build errors.

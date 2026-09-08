import React from "react";
import {
  Plus, LayoutGrid, Users, BarChart3, Store, FileSignature, Boxes,
} from "lucide-react";
import { CardContainer, CardBody, CardItem } from "../ui/3d-card";

/**
 * QUICK HUB MARQUEE
 *
 * The reference layout runs a logo scroller under the hero. Logos would say
 * nothing here, so the same rail carries the studio's own destinations.
 *
 * Two things make it read as a rail rather than a row of buttons:
 *
 *  - The track holds the list TWICE and slides exactly -50%. At the end of the
 *    first copy the frame is pixel-identical to the start, so the wrap is
 *    invisible. Pure CSS, so it runs off the main thread and costs nothing
 *    while React renders the worklist below.
 *
 *  - Each card carries its own colour at rest and tilts toward the cursor on
 *    its own perspective, with the icon standing forward of the label on a
 *    separate Z plane. Colour-on-hover-only made the rail read as seven
 *    identical white pills.
 */

export interface HubTile {
  label: string;
  icon: React.ElementType;
  /** Accent used for the chip at rest and the wash on hover. */
  from: string;
  to: string;
  /** Very light tint for the card face at rest. */
  tint: string;
  onClick?: () => void;
}

interface Props {
  onNavigate: (tab: string) => void;
  onCreateNew: () => void;
  /** Seconds for one full pass. Longer = calmer. */
  speed?: number;
}

const HubMarquee: React.FC<Props> = ({ onNavigate, onCreateNew, speed = 46 }) => {
  const tiles: HubTile[] = [
    { label: "New project",  icon: Plus,          from: "#0066CC", to: "#4A9BE4", tint: "#EEF5FE", onClick: onCreateNew },
    { label: "Projects",     icon: LayoutGrid,    from: "#1D4ED8", to: "#60A5FA", tint: "#EEF2FF", onClick: () => onNavigate("projects") },
    { label: "Clients",      icon: Users,         from: "#0E7C5A", to: "#3FAE87", tint: "#ECF7F2", onClick: () => onNavigate("clients") },
    { label: "Reports",      icon: BarChart3,     from: "#B5945B", to: "#D8C08A", tint: "#FAF6EE", onClick: () => onNavigate("reports") },
    { label: "Rate bank",    icon: Store,         from: "#C77700", to: "#E9B45A", tint: "#FDF5E9", onClick: () => onNavigate("admin-templates-bank") },
    { label: "Templates",    icon: FileSignature, from: "#6D28D9", to: "#A78BFA", tint: "#F5F1FE", onClick: () => onNavigate("admin-templates-bank") },
    { label: "Studio setup", icon: Boxes,         from: "#0F766E", to: "#5EEAD4", tint: "#ECF8F6", onClick: () => onNavigate("studio-settings") },
  ];

  const Card: React.FC<{ t: HubTile }> = ({ t }) => {
    const Icon = t.icon;
    return (
      <CardContainer containerClassName="py-0 shrink-0 w-40 h-24">
        <CardBody
          onClick={t.onClick as any}
          className="group relative w-40 h-24 shrink-0 flex flex-col items-center justify-center gap-2 rounded-[28px] border shadow-sm hover:shadow-lg transition-all overflow-hidden cursor-pointer"
          style={{ backgroundColor: t.tint, borderColor: `${t.from}33` }}
        >
          {/* The wash blooms in from a scaled-up state, so the colour arrives
              rather than simply switching on. */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: `linear-gradient(150deg, ${t.from}1F, ${t.to}2E)` }}
          />

          {/* The chip carries the gradient, not just the glyph. A solid colour
              standing 45px off the face is what makes the lift read as depth;
              a coloured line-icon on white reads flat at this size. The shadow
              is tinted with the tile's own accent so the drop belongs to it. */}
          <CardItem translateZ={45} className="relative">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-shadow duration-300"
              style={{
                background: `linear-gradient(140deg, ${t.from}, ${t.to})`,
                boxShadow: `0 6px 16px -4px ${t.from}66`,
              }}
            >
              <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2} />
            </span>
          </CardItem>

          <CardItem
            translateZ={26}
            className="relative text-[12px] font-semibold text-[#0a1b33] whitespace-nowrap"
          >
            {t.label}
          </CardItem>
        </CardBody>
      </CardContainer>
    );
  };

  return (
    <div className="marquee-viewport relative w-full overflow-hidden py-2">
      <div
        className="marquee-track flex items-center gap-4"
        style={{ ["--speed" as any]: `${speed}s` }}
      >
        {tiles.map((t, i) => <Card key={`a-${i}`} t={t} />)}
        {/* Second copy — this is what makes the wrap invisible. */}
        {tiles.map((t, i) => <Card key={`b-${i}`} t={t} />)}
      </div>
    </div>
  );
};

export default HubMarquee;

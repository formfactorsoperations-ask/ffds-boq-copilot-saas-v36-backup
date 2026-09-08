"use client";

import React, { useState } from "react";
import { cn } from "../../lib/utils";
import { ChevronUp } from "lucide-react";

export interface FloatingDockItem {
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: string | null;
  badgeTone?: 'alert' | 'ok' | 'warn' | 'neutral' | null;
  isActive?: boolean;
  key?: React.Key;
}

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
  tooltipPosition = "bottom",
  alwaysShowLabels = false,
}: {
  items: FloatingDockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
  tooltipPosition?: "top" | "bottom";
  alwaysShowLabels?: boolean;
}) => {
  return (
    <>
      <FloatingDockDesktop
        items={items}
        className={desktopClassName}
        tooltipPosition={tooltipPosition}
        alwaysShowLabels={alwaysShowLabels}
      />
      <FloatingDockMobile items={items} className={mobileClassName} alwaysShowLabels={alwaysShowLabels} />
    </>
  );
};

export const FloatingDockMobile = ({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
  alwaysShowLabels?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative block md:hidden", className)}>
      {open && (
        <div className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-1.5 z-50 bg-white/95 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-xl min-w-[200px] animate-in fade-in slide-in-from-bottom-2 duration-200">
          {items.map((item) => {
            const Content = (
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all relative w-full text-left",
                  item.isActive
                    ? "bg-sky-50 text-[#0055B3] font-bold border border-sky-200"
                    : "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                    item.isActive
                      ? "bg-[#0055B3] text-white"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  )}
                >
                  <div className="h-4 w-4 flex items-center justify-center">{item.icon}</div>
                </div>
                <span className="text-xs font-semibold flex-1 tracking-tight">{item.title}</span>
                {item.badge && (
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full border shadow-2xs",
                      item.badgeTone === "alert"
                        ? "bg-rose-500 text-white border-white"
                        : item.badgeTone === "ok"
                        ? "bg-emerald-500 text-white border-white"
                        : item.badgeTone === "warn"
                        ? "bg-amber-500 text-white border-white"
                        : "bg-slate-700 text-white border-white"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            );

            return (
              <div key={item.title}>
                {item.onClick ? (
                  <button
                    type="button"
                    onClick={() => {
                      item.onClick?.();
                      setOpen(false);
                    }}
                    className="w-full outline-none"
                  >
                    {Content}
                  </button>
                ) : (
                  <a
                    href={item.href || "#"}
                    onClick={() => setOpen(false)}
                    className="w-full outline-none"
                  >
                    {Content}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs text-slate-700 hover:text-slate-900 font-semibold text-xs transition-colors"
      >
        <span>Project Hub</span>
        <ChevronUp className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
    </div>
  );
};

export const FloatingDockDesktop = ({
  items,
  className,
  tooltipPosition = "bottom",
  alwaysShowLabels = false,
}: {
  items: FloatingDockItem[];
  className?: string;
  tooltipPosition?: "top" | "bottom";
  alwaysShowLabels?: boolean;
}) => {
  return (
    <div
      className={cn(
        "hidden md:flex items-center gap-1.5 rounded-xl bg-slate-200/50 p-1 border border-slate-200 shadow-2xs transition-all",
        alwaysShowLabels ? "h-auto py-1 px-1.5" : "h-11",
        className
      )}
    >
      {items.map((item) => (
        <IconContainer
          key={item.title}
          tooltipPosition={tooltipPosition}
          alwaysShowLabels={alwaysShowLabels}
          {...item}
        />
      ))}
    </div>
  );
};

function IconContainer({
  title,
  icon,
  href,
  onClick,
  badge,
  badgeTone,
  isActive,
  tooltipPosition = "bottom",
  alwaysShowLabels = false,
}: FloatingDockItem & {
  tooltipPosition?: "top" | "bottom";
  alwaysShowLabels?: boolean;
}) {
  const ContainerComponent = onClick ? "button" : "a";
  const containerProps = onClick
    ? { type: "button" as const, onClick }
    : { href: href || "#" };

  const isBottom = tooltipPosition === "bottom";

  return (
    <ContainerComponent
      {...containerProps}
      className={cn(
        "outline-none focus:outline-none shrink-0 relative group flex flex-col items-center justify-center cursor-pointer transition-all",
        alwaysShowLabels ? "px-1.5 py-0.5 rounded-lg hover:bg-slate-100/80" : ""
      )}
    >
      <div
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-lg transition-all duration-200 cursor-pointer border transform group-hover:scale-110",
          alwaysShowLabels ? "w-[30px] h-[30px]" : "w-[32px] h-[32px]",
          isActive
            ? "bg-[#0055B3] text-white border-[#004494] shadow-sm ring-2 ring-sky-400/30"
            : "bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200/90 hover:border-slate-300 shadow-2xs"
        )}
      >
        {!alwaysShowLabels && (
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 w-max rounded-md border border-slate-800 bg-[#0F172A] px-2.5 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap text-white shadow-xl pointer-events-none z-50 font-['Plus_Jakarta_Sans'] opacity-0 group-hover:opacity-100 transition-opacity duration-150",
              isBottom ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]"
            )}
          >
            {title}
          </div>
        )}

        {badge && (
          <span
            className={cn(
              "absolute -top-1 -right-1 text-[8px] font-extrabold px-1 py-0.1 rounded-full border shadow-2xs z-10 leading-tight tracking-tight",
              badgeTone === "alert"
                ? "bg-rose-500 text-white border-white"
                : badgeTone === "ok"
                ? "bg-emerald-500 text-white border-white"
                : badgeTone === "warn"
                ? "bg-amber-500 text-white border-white"
                : isActive
                ? "bg-white text-[#0055B3] border-sky-100"
                : "bg-slate-700 text-white border-white"
            )}
          >
            {badge}
          </span>
        )}

        <div
          className={cn(
            "flex items-center justify-center transition-transform duration-200",
            alwaysShowLabels ? "w-[14px] h-[14px]" : "w-[15px] h-[15px]"
          )}
        >
          {icon}
        </div>
      </div>

      {/* Always On Text Label Below Icon */}
      {alwaysShowLabels && (
        <span
          className={cn(
            "text-[10px] font-semibold tracking-tight mt-1 text-center transition-colors leading-none truncate max-w-[70px]",
            isActive
              ? "text-[#0055B3] font-bold"
              : "text-slate-600 group-hover:text-slate-900"
          )}
        >
          {title}
        </span>
      )}
    </ContainerComponent>
  );
}

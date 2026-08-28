"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export default function LampDemo() {
  return (
    <LampContainer>
      <motion.h1
        initial={{ opacity: 0.5, y: 100 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="mt-8 bg-gradient-to-br from-slate-300 to-slate-500 py-4 bg-clip-text text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl"
      >
        Build lamps <br /> the right way
      </motion.h1>
    </LampContainer>
  );
}

export interface LampContainerProps {
  children: React.ReactNode;
  className?: string;
  theme?: "default" | "studio" | "gold";
  containerHeight?: string;
  beamGlowColor?: string;
}

export const LampContainer = ({
  children,
  className,
  theme = "studio",
  containerHeight = "min-h-[22rem]",
}: LampContainerProps) => {
  const isStudio = theme === "studio";
  const isGold = theme === "gold";

  // Beam gradient colors tuned for studio palette
  const beamLeft = isGold
    ? "from-amber-400 via-transparent to-transparent"
    : isStudio
    ? "from-sky-400 via-sky-600/30 to-transparent"
    : "from-cyan-500 via-transparent to-transparent";

  const beamRight = isGold
    ? "from-transparent via-transparent to-amber-400"
    : isStudio
    ? "from-transparent via-sky-600/30 to-sky-400"
    : "from-transparent via-transparent to-cyan-500";

  const glowColor = isGold
    ? "bg-amber-400"
    : isStudio
    ? "bg-sky-500"
    : "bg-cyan-500";

  const lineColor = isGold
    ? "bg-gradient-to-r from-transparent via-amber-400 to-transparent"
    : isStudio
    ? "bg-gradient-to-r from-transparent via-sky-400 to-transparent"
    : "bg-cyan-400";

  const bgBase = isStudio
    ? "bg-[#0B132B]"
    : isGold
    ? "bg-[#14120C]"
    : "bg-slate-950";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden w-full rounded-2xl z-0 shadow-sm border border-slate-800/40",
        containerHeight,
        bgBase,
        className
      )}
    >
      <div className="relative flex w-full flex-1 scale-y-110 sm:scale-y-125 items-center justify-center isolate z-0 pointer-events-none">
        {/* Left Beam */}
        <motion.div
          initial={{ opacity: 0.5, width: "12rem" }}
          whileInView={{ opacity: 1, width: "24rem" }}
          transition={{
            delay: 0.2,
            duration: 0.8,
            ease: "easeInOut",
          }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className={cn(
            "absolute inset-auto right-1/2 h-44 sm:h-52 overflow-visible w-[24rem] bg-gradient-conic text-white [--conic-position:from_70deg_at_center_top]",
            beamLeft
          )}
        >
          <div className={cn("absolute w-[100%] left-0 h-32 bottom-0 z-20 [mask-image:linear-gradient(to_top,white,transparent)]", bgBase)} />
          <div className={cn("absolute w-32 h-[100%] left-0 bottom-0 z-20 [mask-image:linear-gradient(to_right,white,transparent)]", bgBase)} />
        </motion.div>

        {/* Right Beam */}
        <motion.div
          initial={{ opacity: 0.5, width: "12rem" }}
          whileInView={{ opacity: 1, width: "24rem" }}
          transition={{
            delay: 0.2,
            duration: 0.8,
            ease: "easeInOut",
          }}
          style={{
            backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
          }}
          className={cn(
            "absolute inset-auto left-1/2 h-44 sm:h-52 w-[24rem] bg-gradient-conic text-white [--conic-position:from_290deg_at_center_top]",
            beamRight
          )}
        >
          <div className={cn("absolute w-32 h-[100%] right-0 bottom-0 z-20 [mask-image:linear-gradient(to_left,white,transparent)]", bgBase)} />
          <div className={cn("absolute w-[100%] right-0 h-32 bottom-0 z-20 [mask-image:linear-gradient(to_top,white,transparent)]", bgBase)} />
        </motion.div>

        {/* Backdrop Ambient Blurs */}
        <div className={cn("absolute top-1/2 h-40 w-full translate-y-10 scale-x-150 blur-2xl", bgBase)}></div>
        <div className="absolute top-1/2 z-40 h-40 w-full bg-transparent opacity-10 backdrop-blur-md"></div>
        <div className={cn("absolute inset-auto z-40 h-28 w-[20rem] -translate-y-1/2 rounded-full opacity-40 blur-3xl", glowColor)}></div>
        
        {/* Focused Glow Circle */}
        <motion.div
          initial={{ width: "6rem" }}
          whileInView={{ width: "14rem" }}
          transition={{
            delay: 0.2,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className={cn("absolute inset-auto z-30 h-28 w-56 -translate-y-[4.5rem] rounded-full blur-2xl opacity-70", glowColor)}
        ></motion.div>

        {/* Central Emitting Line */}
        <motion.div
          initial={{ width: "10rem" }}
          whileInView={{ width: "22rem" }}
          transition={{
            delay: 0.2,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className={cn("absolute inset-auto z-40 h-0.5 w-[22rem] -translate-y-[5.5rem]", lineColor)}
        ></motion.div>

        <div className={cn("absolute inset-auto z-30 h-36 w-full -translate-y-[10.5rem]", bgBase)}></div>
      </div>

      <div className="relative z-40 flex -translate-y-16 sm:-translate-y-20 flex-col items-center px-4 w-full text-center">
        {children}
      </div>
    </div>
  );
};

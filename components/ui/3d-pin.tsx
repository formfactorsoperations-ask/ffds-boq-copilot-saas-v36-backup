"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

export const PinContainer = ({
  children,
  title,
  href,
  onClick,
  className,
  containerClassName,
  cardClassName,
}: {
  children: React.ReactNode;
  title?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  containerClassName?: string;
  cardClassName?: string;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  const Component = onClick ? "div" : "a";
  const compProps = onClick ? { onClick: handleClick } : { href: href || "#" };

  return (
    <Component
      className={cn(
        "relative group/pin z-20 cursor-pointer block w-full h-full",
        containerClassName
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...compProps}
    >
      <div
        style={{
          perspective: "1000px",
        }}
        className="w-full h-full relative"
      >
        <motion.div
          animate={
            isHovered
              ? {
                  rotateX: 14,
                  scale: 0.97,
                  y: -6,
                  transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] },
                }
              : {
                  rotateX: 0,
                  scale: 1,
                  y: 0,
                  transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] },
                }
          }
          style={{ transformStyle: "preserve-3d" }}
          className={cn(
            "w-full h-full rounded-2xl transition-shadow duration-500",
            isHovered ? "shadow-2xl shadow-sky-500/15" : "shadow-sm",
            cardClassName
          )}
        >
          <div className={cn("relative z-20 w-full h-full", className)}>
            {children}
          </div>
        </motion.div>

        {/* 3D Pin Perspective Overlay on Hover */}
        <PinPerspective title={title} isHovered={isHovered} />
      </div>
    </Component>
  );
};

export const PinPerspective = ({
  title,
  href,
  isHovered,
}: {
  title?: string;
  href?: string;
  isHovered?: boolean;
}) => {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-400 z-50 overflow-visible",
        isHovered ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="w-full h-full flex items-center justify-center relative">
        {/* Floating Pin Title Badge */}
        <div className="absolute -top-3.5 inset-x-0 flex justify-center z-50">
          <motion.div
            initial={{ y: 6, opacity: 0 }}
            animate={isHovered ? { y: 0, opacity: 1 } : { y: 6, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative flex items-center gap-1.5 rounded-full bg-[#0F172A] py-1 px-3.5 border border-sky-400/40 shadow-xl backdrop-blur-md"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0"></span>
            <span className="relative z-20 text-white text-[11px] font-bold tracking-tight inline-block font-['Plus_Jakarta_Sans'] whitespace-nowrap">
              {title || "Open Workspace"}
            </span>
            <span className="absolute -bottom-0 left-[1rem] h-[1px] w-[calc(100%-2rem)] bg-gradient-to-r from-sky-400/0 via-sky-400 to-sky-400/0"></span>
          </motion.div>
        </div>

        {/* 3D Radar Wave Rings */}
        <div
          style={{
            perspective: "800px",
            transform: "rotateX(65deg) translateZ(0)",
          }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={
              isHovered
                ? {
                    opacity: [0, 0.8, 0.4, 0],
                    scale: [0.4, 1.2],
                  }
                : { opacity: 0 }
            }
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: 0,
              ease: "easeOut",
            }}
            className="absolute h-40 w-40 rounded-full border border-sky-400/50 bg-sky-400/[0.08] shadow-[0_0_24px_rgba(56,189,248,0.3)]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={
              isHovered
                ? {
                    opacity: [0, 0.8, 0.4, 0],
                    scale: [0.4, 1.2],
                  }
                : { opacity: 0 }
            }
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: 1,
              ease: "easeOut",
            }}
            className="absolute h-40 w-40 rounded-full border border-sky-400/40 bg-sky-400/[0.06]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={
              isHovered
                ? {
                    opacity: [0, 0.8, 0.4, 0],
                    scale: [0.4, 1.2],
                  }
                : { opacity: 0 }
            }
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: 2,
              ease: "easeOut",
            }}
            className="absolute h-40 w-40 rounded-full border border-sky-400/30 bg-sky-400/[0.04]"
          />
        </div>

        {/* Glowing Vertical Light Beams */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative h-28 w-px">
            <motion.div
              animate={isHovered ? { height: ["0%", "100%"] } : { height: "0%" }}
              transition={{ duration: 0.4 }}
              className="absolute bottom-0 w-full bg-gradient-to-t from-transparent via-sky-400 to-sky-300 blur-[1px]"
            />
            <motion.div
              animate={isHovered ? { height: ["0%", "100%"] } : { height: "0%" }}
              transition={{ duration: 0.4 }}
              className="absolute bottom-0 w-full bg-gradient-to-t from-transparent via-sky-300 to-white"
            />
            <div className="absolute top-0 -left-[2px] w-[5px] h-[5px] bg-sky-400 rounded-full blur-[2px]" />
            <div className="absolute top-0 -left-[1px] w-[3px] h-[3px] bg-white rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

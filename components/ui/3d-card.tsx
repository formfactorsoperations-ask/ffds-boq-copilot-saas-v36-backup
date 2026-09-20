"use client";

import { cn } from "../../lib/utils";

import React, {
  createContext,
  useState,
  useContext,
  useRef,
  useEffect,
} from "react";

/**
 * TILT, DRIVEN PROPERLY
 *
 * This component was tilting on ease-linear, unclamped, with every layer
 * popping to its own depth at the same instant. Linear easing on a rotation is
 * the thing that reads as unfinished -- nothing physical moves at a constant
 * speed -- and an unclamped tilt meant a wide card swung further than a narrow
 * one for the same gesture, because the angle was derived from pixel distance
 * rather than from position within the card.
 *
 * What changed:
 *   - the angle is normalised to the card's own size and clamped to MAX_TILT,
 *     so every card answers a gesture the same way;
 *   - the transform follows the cursor on a short ease while hovered and
 *     settles on a long one when the cursor leaves, instead of one 200ms
 *     linear transition doing both jobs badly;
 *   - layers lift on a stagger ordered by depth, so the card opens rather
 *     than snapping;
 *   - the container publishes --tilt-x / --tilt-y / --tilt-lift, so a card can
 *     move its own shadow against a fixed light (see .fx-tilt-card). A tilt
 *     with a static shadow reads as a flat sticker being rotated;
 *   - none of it runs under prefers-reduced-motion.
 */

/** Degrees at the card's edge. Past about six this stops looking like depth. */
const MAX_TILT = 5;

const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** SSR-safe, and it keeps listening -- the OS setting can change mid-session. */
const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

const MouseEnterContext = createContext<
  [boolean, React.Dispatch<React.SetStateAction<boolean>>] | undefined
>(undefined);

export const CardContainer = ({
  children,
  className,
  containerClassName,
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  key?: React.Key;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMouseEntered, setIsMouseEntered] = useState(false);
  const reduced = usePrefersReducedMotion();

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el || reduced) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    /* Position within the card, -1 to 1, so the angle no longer depends on how
       big the card happens to be. The old form divided raw pixels by 25, which
       gave a 636px-tall card 12.7 degrees and a short one half that. */
    const nx = clamp(((e.clientX - left) / width) * 2 - 1);
    const ny = clamp(((e.clientY - top) / height) * 2 - 1);
    const ry = nx * MAX_TILT;
    const rx = ny * MAX_TILT;
    el.style.transform = `rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) scale(1.012)`;
    el.style.setProperty('--tilt-x', rx.toFixed(2));
    el.style.setProperty('--tilt-y', ry.toFixed(2));
  };

  const handleMouseEnter = (_e: React.MouseEvent<HTMLDivElement>) => {
    setIsMouseEntered(true);
    const el = containerRef.current;
    if (!el || reduced) return;
    /* Short while following the cursor: long enough to smooth the pointer,
       short enough that the card is not lagging behind it. */
    el.style.transition = 'transform 140ms cubic-bezier(.22, 1, .36, 1)';
    el.style.setProperty('--tilt-lift', '1');
  };

  const handleMouseLeave = (_e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    setIsMouseEntered(false);
    if (!el) return;
    /* Long on the way back, so it settles instead of snapping flat. */
    el.style.transition = 'transform 620ms cubic-bezier(.22, 1, .36, 1)';
    el.style.transform = 'rotateY(0deg) rotateX(0deg) scale(1)';
    el.style.setProperty('--tilt-x', '0');
    el.style.setProperty('--tilt-y', '0');
    el.style.setProperty('--tilt-lift', '0');
  };
  return (
    <MouseEnterContext.Provider value={[isMouseEntered, setIsMouseEntered]}>
      <div
        className={cn(
          "flex items-center justify-center",
          containerClassName !== undefined ? containerClassName : "py-20"
        )}
        style={{
          perspective: "1000px",
        }}
        onClick={onClick}
      >
        <div
          ref={containerRef}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={cn(
            "flex items-center justify-center relative w-full h-full",
            className
          )}
          style={{
            transformStyle: "preserve-3d",
            /* The transition is set per gesture in the handlers above, not as a
               blanket transition-all -- that one class was animating layout
               properties on every mousemove as well as the transform. */
            willChange: "transform",
          }}
        >
          {children}
        </div>
      </div>
    </MouseEnterContext.Provider>
  );
};

export const CardBody = ({
  children,
  className,
  onClick,
  style,
  id,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
  id?: string;
  [key: string]: any;
}) => {
  return (
    <div
      id={id}
      onClick={onClick}
      style={style}
      className={cn(
        "[transform-style:preserve-3d] [&>*]:[transform-style:preserve-3d]",
        className ? className : "h-96 w-96"
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

export const CardItem = ({
  as: Tag = "div",
  children,
  className,
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  ...rest
}: {
  as?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  translateX?: number | string;
  translateY?: number | string;
  translateZ?: number | string;
  rotateX?: number | string;
  rotateY?: number | string;
  rotateZ?: number | string;
  [key: string]: any;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isMouseEntered] = useMouseEnter();
  const reduced = usePrefersReducedMotion();

  /* Deeper layers arrive later, so the stack opens toward the reader rather
     than every plane snapping to its depth on the same frame. Capped, or a
     card with many layers would still be moving after the cursor has gone. */
  const lift = Number(translateZ) || 0;
  const delay = Math.min(Math.abs(lift), 40) * 2.2;

  useEffect(() => {
    handleAnimations();
  }, [isMouseEntered, reduced]);

  const handleAnimations = () => {
    if (!ref.current) return;
    if (isMouseEntered && !reduced) {
      ref.current.style.transform = `translateX(${translateX}px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
    } else {
      ref.current.style.transform = `translateX(0px) translateY(0px) translateZ(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg)`;
    }
  };

  return (
    <Tag
      ref={ref}
      className={cn(className || "w-fit")}
      {...rest}
      style={{
        transition: reduced
          ? 'none'
          : `transform 420ms cubic-bezier(.22, 1, .36, 1) ${delay.toFixed(0)}ms`,
        willChange: lift ? 'transform' : undefined,
        /* Spread last so a caller's own style still wins; `rest` is applied
           above only so every other prop passes through unchanged. */
        ...((rest as any).style || {}),
      }}
    >
      {children}
    </Tag>
  );
};

// Create a hook to use the context
export const useMouseEnter = () => {
  const context = useContext(MouseEnterContext);
  if (context === undefined) {
    throw new Error("useMouseEnter must be used within a MouseEnterProvider");
  }
  return context;
};
